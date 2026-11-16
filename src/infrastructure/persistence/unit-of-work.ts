import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';

import { TransactionalContext } from './transactional-context';
import { IUnitOfWork } from '../../application/shared';

@Injectable()
export class UnitOfWork implements IUnitOfWork {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectPinoLogger(UnitOfWork.name) private readonly logger: PinoLogger,
  ) {}

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const active = TransactionalContext.getManager();
    if (active) {
      return work();
    }
    const afterCommit: (() => Promise<void>)[] = [];
    const result = await this.dataSource.transaction((manager) => TransactionalContext.run(manager, work, afterCommit));
    // Committed: the work's outcome stands whatever happens to these follow-ups (e.g. moving logs out of the outbox).
    // They are independent of each other, so they run in parallel.
    const outcomes = await Promise.allSettled(afterCommit.map((callback) => callback()));
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') this.logger.error({ err: outcome.reason }, 'After-commit callback failed');
    }
    return result;
  }
}
