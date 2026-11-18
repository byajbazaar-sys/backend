import { AdminSeed } from './admin.seed';
import { InventoryCategoriesSeed } from './inventory-categories.seed';
import { ItemsSeed } from './items.seed';
import { SeedingService } from './seeding.service';

/** Seeds run on startup, registered by InfrastructureModule. */
export const SEEDS = [AdminSeed, ItemsSeed, InventoryCategoriesSeed, SeedingService];
