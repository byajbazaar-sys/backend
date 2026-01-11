import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemsSchema, ItemDocument } from '../schemas/items.schema';
import { ESeedType, SYSTEM_USER_ID } from '@shared-libs';
import { BaseSeed } from './base.seed';
import { SeedsSchema, SeedsDocument } from '../schemas/seeds.schema';
import { Types } from 'mongoose';

export class ItemsSeed extends BaseSeed {
  protected readonly logger = new Logger(ItemsSeed.name);
  protected readonly name = ESeedType.Items;
  private readonly VERSION = 1; // Version constant for this seeder

  constructor(
    @InjectModel(ItemsSchema.name) private readonly itemModel: Model<ItemDocument>,
    @InjectModel(SeedsSchema.name) seedVersionModel: Model<SeedsDocument>,
  ) {
    super(seedVersionModel);
  }

  // Dynamic version getter
  protected get version(): number {
    return this.VERSION;
  }

  protected async seed(): Promise<void> {
    // Seed GOLD item
    const goldItem = await this.itemModel.findOne({ name: 'Gold' }).exec();
    if (!goldItem) {
      await this.itemModel.create({
        _id: new Types.ObjectId(),
        name: 'Gold',
        description: 'Pure gold item',
        createdBy: SYSTEM_USER_ID, // System user
      });
      this.logger.log('Gold item created successfully');
    } else {
      this.logger.log('Gold item already exists');
    }

    // Seed SILVER item
    const silverItem = await this.itemModel.findOne({ name: 'Silver' }).exec();
    if (!silverItem) {
      await this.itemModel.create({
        _id: new Types.ObjectId(),
        name: 'Silver',
        description: 'Pure silver item',
        createdBy: SYSTEM_USER_ID, // System user
      });
      this.logger.log('Silver item created successfully');
    } else {
      this.logger.log('Silver item already exists');
    }
  }
}
