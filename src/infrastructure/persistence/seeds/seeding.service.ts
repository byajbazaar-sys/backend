import { Injectable } from '@nestjs/common';

import { AdminSeed } from './admin.seed';
import { ItemsSeed } from './items.seed';

@Injectable()
export class SeedingService {
  constructor(
    private adminRolesSeed: AdminSeed,
    private itemsSeed: ItemsSeed,
  ) {}

  public async runAsync(): Promise<void> {
    await this.adminRolesSeed.runAsync();
    await this.itemsSeed.runAsync();
  }
}
