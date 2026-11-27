import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

import { aiDataSourceOptions } from './ai-data-source';
import { AiConfig } from '../../ai.config';

/**
 * Lazily-connected AI database. Connecting on first use (not at boot) means a missing or unreachable AI database
 * only affects the assistant, never the rest of ByajBazaar.
 */
@Injectable()
export class AiDatabase implements OnModuleDestroy {
  private dataSource: DataSource | null = null;
  private connecting: Promise<DataSource> | null = null;

  constructor(
    private readonly config: AiConfig,
    @InjectPinoLogger(AiDatabase.name) private readonly logger: PinoLogger,
  ) {}

  async connection(): Promise<DataSource> {
    if (this.dataSource?.isInitialized) return this.dataSource;
    if (this.connecting === null) {
      const ds = new DataSource(aiDataSourceOptions(this.config));
      this.connecting = ds
        .initialize()
        .then((ready) => {
          this.dataSource = ready;
          this.logger.info({ dedicated: this.config.db.dedicated }, 'AI database connected');
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

  /** Runs pending AI migrations (post-deploy). */
  async runMigrations(): Promise<number> {
    const ran = await (await this.connection()).runMigrations({ transaction: 'each' });
    return ran.length;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized) await this.dataSource.destroy();
  }
}
