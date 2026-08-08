import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { MetalRateEntity } from '../entities/metal-rate.entity';
import { IMetalRatesRepository, MetalRate } from '../../../application';

@Injectable()
export class MetalRatesRepository implements IMetalRatesRepository {
  constructor(
    @InjectRepository(MetalRateEntity)
    private readonly repo: Repository<MetalRateEntity>,
  ) {}

  private mapEntity(entity: MetalRateEntity): MetalRate {
    return plainToInstance(MetalRate, entity, { excludeExtraneousValues: true });
  }

  async insert(data: MetalRate): Promise<MetalRate> {
    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
    return this.mapEntity(saved);
  }

  async findCurrentRates(userId: string): Promise<MetalRate[]> {
    const rows: MetalRateEntity[] = await this.repo.query(
      `
        SELECT DISTINCT ON (purity)
          id,
          created_by AS "createdBy",
          metal_type AS "metalType",
          purity,
          rate,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM metal_rates
        WHERE created_by = $1
        ORDER BY purity, created_at DESC
      `,
      [userId],
    );
    return plainToInstance(MetalRate, rows, { excludeExtraneousValues: true });
  }

  async findHistory(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MetalRate[]; totalCount: number }> {
    const [entities, totalCount] = await this.repo.findAndCount({
      where: { createdBy: userId },
      order: { createdAt: 'DESC' },
      skip: page * pageSize,
      take: pageSize,
    });
    return {
      items: plainToInstance(MetalRate, entities, { excludeExtraneousValues: true }),
      totalCount,
    };
  }

  async findById(id: string): Promise<MetalRate> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async deleteById(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async findForChart(userId: string, startDate: Date, endDate: Date): Promise<MetalRate[]> {
    const entities = await this.repo
      .createQueryBuilder('rate')
      .where('rate.createdBy = :userId', { userId })
      .andWhere('rate.createdAt >= :startDate', { startDate })
      .andWhere('rate.createdAt <= :endDate', { endDate })
      .orderBy('rate.createdAt', 'ASC')
      .getMany();
    return plainToInstance(MetalRate, entities, { excludeExtraneousValues: true });
  }
}
