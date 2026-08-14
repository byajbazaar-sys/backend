import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ESeedType, SYSTEM_USER_ID } from '@shared-libs';
import { Repository } from 'typeorm';

import { BaseSeed } from './base.seed';
import { InventoryCategoryEntity } from '../entities/inventory-category.entity';
import { SeedEntity } from '../entities/seed.entity';

const DEFAULT_CATEGORIES = [
  { name: 'Ring', description: 'Gold and diamond rings' },
  { name: 'Chain', description: 'Gold and silver chains' },
  { name: 'Necklace', description: 'Necklaces and chokers' },
  { name: 'Pendant', description: 'Pendants and lockets' },
  { name: 'Earrings', description: 'Studs, hoops, and drops' },
  { name: 'Bracelet', description: 'Bracelets and bangles' },
  { name: 'Coin', description: 'Gold and silver coins' },
  { name: 'Silver Article', description: 'Silver utensils and articles' },
];

@Injectable()
export class InventoryCategoriesSeed extends BaseSeed {
  protected readonly logger = new Logger(InventoryCategoriesSeed.name);
  protected readonly name = ESeedType.InventoryCategories;
  private readonly VERSION = 1;

  constructor(
    @InjectRepository(InventoryCategoryEntity)
    private readonly categoryRepo: Repository<InventoryCategoryEntity>,
    @InjectRepository(SeedEntity) seedRepo: Repository<SeedEntity>,
  ) {
    super(seedRepo);
  }

  protected get version(): number {
    return this.VERSION;
  }

  protected async seed(): Promise<void> {
    for (const cat of DEFAULT_CATEGORIES) {
      const existing = await this.categoryRepo.findOne({
        where: { name: cat.name, createdBy: SYSTEM_USER_ID },
      });
      if (!existing) {
        await this.categoryRepo.save({
          name: cat.name,
          description: cat.description,
          createdBy: SYSTEM_USER_ID,
          isSystem: true,
        });
        this.logger.log(`Inventory category "${cat.name}" created`);
      }
    }
  }
}
