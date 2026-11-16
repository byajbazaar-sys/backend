import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

import { marketingDataSourceOptions } from './marketing-data-source';
import { MarketingConfig } from '../../marketing.config';

/**
 * Lazily-connected marketing database. Connecting on first use (instead of at boot) means a missing or
 * unreachable marketing DB only affects marketing requests, never the rest of ByajBazaar.
 */
@Injectable()
export class MarketingDatabase implements OnModuleDestroy {
  private dataSource: DataSource | null = null;
  private connecting: Promise<DataSource> | null = null;

  constructor(
    private readonly config: MarketingConfig,
    @InjectPinoLogger(MarketingDatabase.name) private readonly logger: PinoLogger,
  ) {}

  async connection(): Promise<DataSource> {
    if (this.dataSource?.isInitialized) return this.dataSource;
    if (this.connecting === null) {
      const ds = new DataSource(marketingDataSourceOptions(this.config));
      this.connecting = ds
        .initialize()
        .then((ready) => {
          this.dataSource = ready;
          this.logger.info({ dedicated: this.config.db.dedicated }, 'Marketing database connected');
          return ready;
        })
        .finally(() => {
          this.connecting = null;
        });
    }
    return this.connecting;
  }

  async repository<T extends ObjectLiteral>(entity: EntityTarget<T>): Promise<Repository<T>> {
    return (await this.connection()).getRepository(entity);
  }

  /** Runs pending marketing migrations (post-deploy). */
  async runMigrations(): Promise<number> {
    const ran = await (await this.connection()).runMigrations({ transaction: 'each' });
    return ran.length;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized) await this.dataSource.destroy();
  }
}
