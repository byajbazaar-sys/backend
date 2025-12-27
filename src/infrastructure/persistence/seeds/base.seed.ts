import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SeedsSchema, SeedsDocument } from '../schemas/seeds.schema';

@Injectable()
export abstract class BaseSeed {
  protected abstract readonly logger: Logger;
  protected abstract readonly name: string;
 protected abstract get version(): number; // Changed to getter
  
  constructor(
    @InjectModel(SeedsSchema.name) protected readonly seedsModel: Model<SeedsDocument>,
  ) {}

  async runAsync(): Promise<boolean> {
    try {
      const currentVersion = await this.getCurrentVersion();
      const targetVersion = this.version; // Using the getter
      
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
    const doc = await this.seedsModel.findOne({ name: this.name }).exec();
    return doc?.version || 0;
  }

  private async updateVersion(version: number): Promise<void> {
    await this.seedsModel.findOneAndUpdate(
      { name: this.name },
      { 
        $set: { 
          version,
          timestamp: new Date(),
        },
        $setOnInsert: { name: this.name },
      },
      { upsert: true, new: true },
    ).exec();
  }

  protected abstract seed(): Promise<void>;
}
