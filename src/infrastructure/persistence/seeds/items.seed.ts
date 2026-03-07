import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemEntity } from '../entities/item.entity';
import { SeedEntity } from '../entities/seed.entity';
import { ESeedType, SYSTEM_USER_ID } from '@shared-libs';
import { BaseSeed } from './base.seed';

@Injectable()
export class ItemsSeed extends BaseSeed {
  protected readonly logger = new Logger(ItemsSeed.name);
  protected readonly name = ESeedType.Items;
  private readonly VERSION = 1;

  constructor(
    @InjectRepository(ItemEntity) private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(SeedEntity) seedRepo: Repository<SeedEntity>,
  ) {
    super(seedRepo);
  }

  protected get version(): number {
    return this.VERSION;
  }

  protected async seed(): Promise<void> {
    const goldItem = await this.itemRepo.findOne({ where: { name: 'Gold' } });
    if (!goldItem) {
      await this.itemRepo.save({
        name: 'Gold',
        description: 'Pure gold item',
        createdBy: SYSTEM_USER_ID,
      });
      this.logger.log('Gold item created successfully');
    } else {
      this.logger.log('Gold item already exists');
    }

    const silverItem = await this.itemRepo.findOne({ where: { name: 'Silver' } });
    if (!silverItem) {
      await this.itemRepo.save({
        name: 'Silver',
        description: 'Pure silver item',
        createdBy: SYSTEM_USER_ID,
      });
      this.logger.log('Silver item created successfully');
    } else {
      this.logger.log('Silver item already exists');
    }
  }
}
