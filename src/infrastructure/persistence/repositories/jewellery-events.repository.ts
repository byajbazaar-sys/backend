import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import {
  EJewelleryEventStatus,
  JewelleryEvent,
  JewelleryEventDuplicateQuery,
  JewelleryEventRelatedQuery,
} from '../../../application/features/events/domain';
import { JewelleryEventUpdatePatch } from '../../../application/features/events/models';
import { IJewelleryEventsRepository } from '../../../application/features/events/service/i-jewellery-events.repository';
import { JewelleryEventsFilter } from '../../../application/features/events/service/jewellery-events-filter';
import { JewelleryEventEntity } from '../entities/jewellery-event.entity';

@Injectable()
export class JewelleryEventsRepository implements IJewelleryEventsRepository {
  constructor(
    @InjectRepository(JewelleryEventEntity)
    private readonly eventRepo: Repository<JewelleryEventEntity>,
  ) {}

  private map(entity: JewelleryEventEntity): JewelleryEvent {
    return plainToInstance(JewelleryEvent, entity, { excludeExtraneousValues: true });
  }

  async create(data: JewelleryEvent): Promise<JewelleryEvent> {
    const entity = this.eventRepo.create({
      ...data,
      tags: data.tags ?? [],
      status: data.status ?? EJewelleryEventStatus.ACTIVE,
      isFeatured: data.isFeatured ?? false,
      country: data.country ?? 'India',
    });
    const saved = await this.eventRepo.save(entity);
    return this.map(saved);
  }

  async update(id: string, data: JewelleryEventUpdatePatch): Promise<JewelleryEvent> {
    const {
      id: _omit,
      createdAt: _c,
      updatedAt: _u,
      ...rest
    } = data as JewelleryEvent & {
      id?: string;
    };
    await this.eventRepo.update(id, rest as Partial<JewelleryEventEntity>);
    const updated = await this.eventRepo.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`Jewellery event ${id} not found after update`);
    }
    return this.map(updated);
  }

  async delete(id: string): Promise<void> {
    await this.eventRepo.delete(id);
  }

  async findById(id: string): Promise<JewelleryEvent> {
    const entity = await this.eventRepo.findOne({ where: { id } });
    return entity ? this.map(entity) : null;
  }

  async findBySlug(slug: string): Promise<JewelleryEvent> {
    const entity = await this.eventRepo.findOne({ where: { slug } });
    return entity ? this.map(entity) : null;
  }

  async findDuplicate(params: JewelleryEventDuplicateQuery): Promise<JewelleryEvent> {
    const qb = this.eventRepo
      .createQueryBuilder('e')
      .where('LOWER(e.name) = LOWER(:name)', { name: params.name.trim() });

    if (params.city) {
      qb.andWhere('LOWER(e.city) = LOWER(:city)', { city: params.city.trim() });
    } else {
      qb.andWhere('e.city IS NULL');
    }

    if (params.startDate) {
      const day = new Date(params.startDate).toISOString().slice(0, 10);
      qb.andWhere('e.start_date = :startDate', { startDate: day });
    } else {
      qb.andWhere('e.start_date IS NULL');
    }

    const entity = await qb.getOne();
    return entity ? this.map(entity) : null;
  }

  async list(filter: JewelleryEventsFilter): Promise<Paged<JewelleryEvent>> {
    const { pageNumber, pageSize, skip } = getPaginationValues(filter);
    const qb = this.eventRepo.createQueryBuilder('e');

    if (filter.status) {
      qb.andWhere('e.status = :status', { status: filter.status });
    }
    if (filter.city) {
      qb.andWhere('LOWER(e.city) = LOWER(:city)', { city: filter.city });
    }
    if (filter.state) {
      qb.andWhere('LOWER(e.state) = LOWER(:state)', { state: filter.state });
    }
    if (filter.featured) {
      qb.andWhere('e.is_featured = true');
    }
    if (filter.search?.trim()) {
      qb.andWhere(
        `(e.name ILIKE :search OR e.city ILIKE :search OR e.venue ILIKE :search OR e.organizer ILIKE :search)`,
        { search: `%${filter.search.trim()}%` },
      );
    }
    if (filter.upcomingOnly) {
      qb.andWhere('(e.end_date IS NULL OR e.end_date >= CURRENT_DATE)');
    }

    qb.orderBy('e.is_featured', 'DESC').addOrderBy('e.start_date', 'ASC', 'NULLS LAST').skip(skip).take(pageSize);

    const [rows, totalCount] = await qb.getManyAndCount();
    return toPaged(JewelleryEvent, {
      items: rows.map((r) => this.map(r)),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async findRelated(params: JewelleryEventRelatedQuery): Promise<JewelleryEvent[]> {
    const qb = this.eventRepo
      .createQueryBuilder('e')
      .where('e.id != :id', { id: params.excludeId })
      .andWhere('e.status = :status', { status: EJewelleryEventStatus.ACTIVE })
      .andWhere('(e.end_date IS NULL OR e.end_date >= CURRENT_DATE)');

    if (params.city || params.state) {
      qb.andWhere('(LOWER(e.city) = LOWER(:city) OR LOWER(e.state) = LOWER(:state))', {
        city: params.city ?? '',
        state: params.state ?? '',
      });
    }

    qb.orderBy('e.start_date', 'ASC', 'NULLS LAST').take(params.limit ?? 6);
    const rows = await qb.getMany();
    return rows.map((r) => this.map(r));
  }
}
