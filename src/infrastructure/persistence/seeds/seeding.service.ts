import { Injectable } from "@nestjs/common";
import { AdminSeed } from "./admin.seed";

@Injectable()
export class SeedingService {
  constructor(
    private adminRolesSeed: AdminSeed,
  ) {}

  public async runAsync(): Promise<void> {
    await this.adminRolesSeed.runAsync();
  }
}