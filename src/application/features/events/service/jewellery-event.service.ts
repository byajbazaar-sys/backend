import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Paged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  EJewelleryEventStatus,
  JewelleryEvent,
  JewelleryEventDuplicateQuery,
  JewelleryEventDetailResult,
  JewelleryEventRelatedQuery,
} from '../domain';
import {
  CreateJewelleryEventRequestModel,
  ListJewelleryEventsQueryModel,
  UpdateJewelleryEventRequestModel,
  JewelleryEventUpdatePatch,
} from '../models';
import { IJewelleryEventService } from './i-jewellery-event.service';
import { IJewelleryEventsRepository, JEWELLERY_EVENTS_REPOSITORY } from './i-jewellery-events.repository';
import { buildEventSlug } from '../utils/slug.util';

@Injectable()
export class JewelleryEventService implements IJewelleryEventService {
  constructor(
    @Inject(JEWELLERY_EVENTS_REPOSITORY)
    private readonly eventsRepo: IJewelleryEventsRepository,
    @InjectPinoLogger(JewelleryEventService.name) private readonly logger: PinoLogger,
  ) {}

  private toDate(value?: string | Date): Date {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!Array.isArray(tags)) return [];
    return tags
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  private assertValidDates(startDate?: Date, endDate?: Date): void {
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate cannot be earlier than startDate');
    }
  }

  private async resolveUniqueSlug(desired: string, excludeId?: string): Promise<string> {
    let slug = desired || `event-${Date.now()}`;
    let attempt = 0;
    while (attempt < 50) {
      const existing = await this.eventsRepo.findBySlug(slug);
      if (!existing || (excludeId && existing.id === excludeId)) {
        return slug;
      }
      attempt += 1;
      slug = `${desired}-${attempt + 1}`;
    }
    return `${desired}-${Date.now()}`;
  }

  private fromRequest(
    body: CreateJewelleryEventRequestModel | UpdateJewelleryEventRequestModel,
  ): JewelleryEventUpdatePatch {
    return {
      name: body.name?.trim(),
      slug: body.slug?.trim(),
      description: body.description?.trim() || null,
      startDate: this.toDate(body.startDate),
      endDate: this.toDate(body.endDate),
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      country: body.country?.trim() || 'India',
      venue: body.venue?.trim() || null,
      organizer: body.organizer?.trim() || null,
      category: body.category?.trim() || null,
      website: body.website?.trim() || null,
      registrationUrl: body.registrationUrl?.trim() || null,
      sourceUrl: body.sourceUrl?.trim() || null,
      visitorEntryFee: body.visitorEntryFee?.trim() || null,
      stallFee: body.stallFee?.trim() || null,
      contactEmail: body.contactEmail?.trim() || null,
      contactPhone: body.contactPhone?.trim() || null,
      tags: this.normalizeTags(body.tags),
      status: body.status ?? EJewelleryEventStatus.ACTIVE,
      isFeatured: body.isFeatured ?? false,
      seoTitle: body.seoTitle?.trim() || null,
      seoDescription: body.seoDescription?.trim() || null,
    };
  }

  async listPublic(query: ListJewelleryEventsQueryModel): Promise<Paged<JewelleryEvent>> {
    return this.eventsRepo.list({
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      city: query.city,
      state: query.state,
      search: query.search,
      featured: query.featured === 'true' || query.featured === '1',
      status: EJewelleryEventStatus.ACTIVE,
      upcomingOnly: true,
    });
  }

  async getBySlug(slug: string): Promise<JewelleryEventDetailResult> {
    const event = await this.eventsRepo.findBySlug(slug);
    if (!event || event.status !== EJewelleryEventStatus.ACTIVE) {
      throw new NotFoundException('Event not found');
    }
    const related = await this.eventsRepo.findRelated(
      plainToInstance(JewelleryEventRelatedQuery, {
        excludeId: event.id,
        city: event.city,
        state: event.state,
        limit: 6,
      }),
    );
    return plainToInstance(JewelleryEventDetailResult, { event, related }, { excludeExtraneousValues: true });
  }

  async listAdmin(query: ListJewelleryEventsQueryModel): Promise<Paged<JewelleryEvent>> {
    return this.eventsRepo.list({
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      city: query.city,
      state: query.state,
      search: query.search,
      status: query.status,
      featured: query.featured === 'true' || query.featured === '1' ? true : undefined,
      upcomingOnly: false,
    });
  }

  async create(body: CreateJewelleryEventRequestModel): Promise<JewelleryEvent> {
    const data = this.fromRequest(body);
    if (!data.name) {
      throw new BadRequestException('name is required');
    }
    this.assertValidDates(data.startDate ?? null, data.endDate ?? null);

    const duplicate = await this.eventsRepo.findDuplicate(
      plainToInstance(JewelleryEventDuplicateQuery, {
        name: data.name,
        city: data.city,
        startDate: data.startDate,
      }),
    );
    if (duplicate) {
      throw new ConflictException('An event with the same name, city and start date already exists');
    }

    const baseSlug = data.slug || buildEventSlug({ name: data.name, city: data.city, startDate: data.startDate });
    data.slug = await this.resolveUniqueSlug(baseSlug);

    const created = await this.eventsRepo.create({
      ...(data as JewelleryEvent),
      status: data.status ?? EJewelleryEventStatus.ACTIVE,
      isFeatured: data.isFeatured ?? false,
      tags: data.tags ?? [],
      country: data.country ?? 'India',
    });
    this.logger.info({ eventId: created.id, slug: created.slug }, 'Jewellery event created');
    return created;
  }

  async update(id: string, body: UpdateJewelleryEventRequestModel): Promise<JewelleryEvent> {
    const existing = await this.eventsRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    const data = this.fromRequest(body);
    const name = data.name ?? existing.name;
    const city = data.city !== undefined ? data.city : existing.city;
    const startDate = data.startDate !== undefined ? data.startDate : existing.startDate;
    const endDate = data.endDate !== undefined ? data.endDate : existing.endDate;
    this.assertValidDates(startDate ?? null, endDate ?? null);

    const duplicate = await this.eventsRepo.findDuplicate(
      plainToInstance(JewelleryEventDuplicateQuery, { name, city, startDate }),
    );
    if (duplicate?.id !== id) {
      throw new ConflictException('An event with the same name, city and start date already exists');
    }

    if (data.slug || data.name || data.city !== undefined || data.startDate !== undefined) {
      const baseSlug = data.slug || buildEventSlug({ name, city, startDate });
      data.slug = await this.resolveUniqueSlug(baseSlug, id);
    }

    const updated = await this.eventsRepo.update(id, data);
    this.logger.info({ eventId: id }, 'Jewellery event updated');
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.eventsRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Event not found');
    }
    await this.eventsRepo.delete(id);
    this.logger.info({ eventId: id }, 'Jewellery event deleted');
  }
}
