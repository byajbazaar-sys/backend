import { AdminSeed } from './admin.seed';
import { ItemsSeed } from './items.seed';
import { SeedingService } from './seeding.service';

export * from './seeding.service';
export * from './admin.seed';
export * from './items.seed';

export default [AdminSeed, ItemsSeed, SeedingService];