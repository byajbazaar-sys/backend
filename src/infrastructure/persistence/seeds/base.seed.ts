import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeedEntity } from '../entities/seed.entity';
import { ESeedType } from '@shared-libs';

@Injectable()
export abstract class BaseSeed {
  protected abstract readonly logger: Logger;
  protected abstract readonly name: ESeedType;
  protected abstract get version(): number;

  constructor(
    @InjectRepository(SeedEntity) protected readonly seedRepo: Repository<SeedEntity>,
  ) {}

  async runAsync(): Promise<boolean> {
    try {
      const currentVersion = await this.getCurrentVersion();
      const targetVersion = this.version;

      if (currentVersion >= targetVersion) {
        this.logger.log(`${this.name} seeder is up to date (v${currentVersion})`);
        return false;
      }
      this.logger.log(`Running ${this.name} seeder (v${targetVersion})...`);

      await this.seed();

      await this.updateVersion(targetVersion);

      this.logger.log(`${this.name} seeder completed successfully (v${targetVersion})`);
      return true;
    } catch (error) {
      this.logger.error(`Error in ${this.name} seeder:`, error.stack);
      throw error;
    }
  }

  private async getCurrentVersion(): Promise<number> {
    const doc = await this.seedRepo.findOne({ where: { name: this.name } });
    return doc?.version ?? 0;
  }

  private async updateVersion(version: number): Promise<void> {
    const existing = await this.seedRepo.findOne({ where: { name: this.name } });
    if (existing) {
      await this.seedRepo.update(existing.id, { version, timestamp: new Date() });
    } else {
      await this.seedRepo.save({
        name: this.name,
        version,
        timestamp: new Date(),
      });
    }
  }

  protected abstract seed(): Promise<void>;
}
