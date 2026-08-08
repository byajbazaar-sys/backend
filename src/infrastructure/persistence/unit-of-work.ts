import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IUnitOfWork } from '../../application/shared';
import { TransactionalContext } from './transactional-context';

@Injectable()
export class UnitOfWork implements IUnitOfWork {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const active = TransactionalContext.getManager();
    if (active) {
      return work();
    }
    return this.dataSource.transaction((manager) =>
      TransactionalContext.run(manager, work),
    );
  }
}
