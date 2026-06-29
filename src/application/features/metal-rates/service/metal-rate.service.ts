import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { EMetalType } from '../../inventory/enums';
import { MetalRate } from '../domain';
import {
  CURRENT_RATE_KEYS,
  CurrentRateKey,
  isAllowedRatePurity,
  purityToCurrentKey,
} from '../constants';
import {
  CreateMetalRateRequestModel,
  CurrentMetalRatesResponseModel,
  ListMetalRatesQueryModel,
  MetalRateChartPointModel,
} from '../models';
import { IMetalRateService } from './i-metal-rate.service';
import { IMetalRatesRepository, METAL_RATES_REPOSITORY } from './i-metal-rates.repository';

@Injectable()
export class MetalRateService implements IMetalRateService {
  constructor(
    @Inject(METAL_RATES_REPOSITORY) private readonly ratesRepo: IMetalRatesRepository,
    @InjectPinoLogger(MetalRateService.name) private readonly logger: PinoLogger,
  ) {}

  async getCurrent(userId: string): Promise<CurrentMetalRatesResponseModel> {
    const latest = await this.ratesRepo.findCurrentRates(userId);
    const response: Record<string, number | string | null> = {
      gold24: null,
      gold22: null,
      gold20: null,
      gold18: null,
      silver999: null,
      silver925: null,
      gold24UpdatedAt: null,
      gold22UpdatedAt: null,
      gold20UpdatedAt: null,
      gold18UpdatedAt: null,
      silver999UpdatedAt: null,
      silver925UpdatedAt: null,
    };

    for (const entry of latest) {
      const key = purityToCurrentKey(entry.metalType, entry.purity);
      if (!key) continue;
      response[key] = Number(entry.rate);
      response[`${key}UpdatedAt`] = entry.createdAt?.toISOString() ?? null;
    }

    return plainToInstance(CurrentMetalRatesResponseModel, response, { excludeExtraneousValues: true });
  }

  async create(data: CreateMetalRateRequestModel, userId: string): Promise<MetalRate> {
    const purity = data.purity.trim().toUpperCase();
    if (data.metalType !== EMetalType.Gold && data.metalType !== EMetalType.Silver) {
      throw new BadRequestException('Only GOLD and SILVER rates are supported');
    }
    if (!isAllowedRatePurity(data.metalType, purity)) {
      throw new BadRequestException(`Unsupported purity ${purity} for ${data.metalType}`);
    }
    if (!Number.isFinite(data.rate) || data.rate < 0) {
      throw new BadRequestException('Rate must be a non-negative number');
    }

    const created = await this.ratesRepo.insert({
      metalType: data.metalType,
      purity,
      rate: Math.round(data.rate * 100) / 100,
      createdBy: userId,
    });

    this.logger.info({ userId, metalType: data.metalType, purity, rate: data.rate }, 'Metal rate recorded');
    return created;
  }

  async listHistory(userId: string, query: ListMetalRatesQueryModel) {
    const page = query.pageNumber ?? 0;
    const pageSize = query.pageSize ?? 20;
    const { items, totalCount } = await this.ratesRepo.findHistory(userId, page, pageSize);
    return { items, totalCount, page, pageSize };
  }

  async deleteEntry(id: string, userId: string): Promise<void> {
    const entry = await this.ratesRepo.findById(id);
    if (!entry) throw new NotFoundException('Rate entry not found');
    if (entry.createdBy !== userId) throw new ForbiddenException('Access denied');
    await this.ratesRepo.deleteById(id);
    this.logger.info({ userId, entryId: id }, 'Metal rate history entry deleted');
  }

  async bulkDelete(ids: string[], userId: string): Promise<{ deletedCount: number }> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
      throw new BadRequestException('No rate entry ids provided');
    }

    for (const id of uniqueIds) {
      await this.deleteEntry(id, userId);
    }

    this.logger.info({ count: uniqueIds.length, userId }, 'Metal rate entries bulk deleted');
    return { deletedCount: uniqueIds.length };
  }

  async getChart(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<MetalRateChartPointModel[]> {
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date();
    const start = startDate
      ? new Date(`${startDate}T00:00:00.000Z`)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    if (start > end) {
      throw new BadRequestException('startDate must be before endDate');
    }

    const entries = await this.ratesRepo.findForChart(userId, start, end);
    const points = this.buildChartPoints(entries);
    return plainToInstance(MetalRateChartPointModel, points, { excludeExtraneousValues: true });
  }

  private buildChartPoints(entries: MetalRate[]): MetalRateChartPointModel[] {
    const byDay = new Map<string, MetalRate[]>();

    for (const entry of entries) {
      if (!entry.createdAt) continue;
      const day = entry.createdAt.toISOString().slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(entry);
      byDay.set(day, list);
    }

    const days = [...byDay.keys()].sort();
    const running: Partial<Record<CurrentRateKey, number | null>> = {};
    for (const key of CURRENT_RATE_KEYS) running[key] = null;

    const result: MetalRateChartPointModel[] = [];

    for (const day of days) {
      for (const entry of byDay.get(day) ?? []) {
        const key = purityToCurrentKey(entry.metalType, entry.purity);
        if (key) running[key] = Number(entry.rate);
      }

      result.push({
        date: day,
        gold24: running.gold24 ?? null,
        gold22: running.gold22 ?? null,
        gold20: running.gold20 ?? null,
        gold18: running.gold18 ?? null,
        silver999: running.silver999 ?? null,
        silver925: running.silver925 ?? null,
      });
    }

    return result;
  }
}
