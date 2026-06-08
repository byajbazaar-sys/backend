import { AdminSeed } from './admin.seed';
import { ItemsSeed } from './items.seed';
import { InventoryCategoriesSeed } from './inventory-categories.seed';
import { SeedingService } from './seeding.service';

export * from './seeding.service';
export * from './admin.seed';
export * from './items.seed';
export * from './inventory-categories.seed';

export default [AdminSeed, ItemsSeed, InventoryCategoriesSeed, SeedingService];