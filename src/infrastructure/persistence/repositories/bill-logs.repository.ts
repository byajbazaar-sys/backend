import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import { BillLog, BillLogsQuery, IBillLogsRepository } from '../../../application';
import { BillLogEntity } from '../entities';
import { TransactionalContext } from '../transactional-context';

@Injectable()
export class BillLogsRepository implements IBillLogsRepository {
  constructor(@InjectRepository(BillLogEntity) private readonly defaultRepo: Repository<BillLogEntity>) {}

  private get repo(): Repository<BillLogEntity> {
    return TransactionalContext.repositoryFor(BillLogEntity, this.defaultRepo);
  }

  async create(log: BillLog): Promise<BillLog> {
    const saved = await this.repo.save(
      this.repo.create({
        billId: log.billId ?? null,
        billNumber: log.billNumber,
        userId: log.userId,
        action: log.action,
        changes: (log.changes ?? []) as unknown[],
        snapshot: log.snapshot ?? null,
        channel: log.channel ?? null,
        performedBy: log.performedBy ?? null,
      }),
    );
    return plainToInstance(BillLog, saved, { excludeExtraneousValues: true });
  }

  async find(query: BillLogsQuery): Promise<Paged<BillLog>> {
    const { pageNumber, pageSize, skip } = getPaginationValues({
      pageNumber: query.pageNumber,
      pageSize: query.pageSize ?? 50,
    });
    const qb = this.repo
      .createQueryBuilder('log')
      .leftJoin('log.performer', 'performer')
      .addSelect(['performer.firstName', 'performer.lastName'])
      .where('log.userId = :userId', { userId: query.userId })
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize);
    if (query.billId) qb.andWhere('log.billId = :billId', { billId: query.billId });
    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    const [rows, totalCount] = await qb.getManyAndCount();
    return toPaged(BillLog, {
      items: rows.map((row) => ({
        ...row,
        performedByName: row.performer
          ? [row.performer.firstName, row.performer.lastName].filter(Boolean).join(' ').trim() || null
          : null,
      })),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }
}
