import { Injectable } from "@nestjs/common";
import { UpdateDuesCronService } from "./update-dues.cron.service";

@Injectable()
export class CronService {
  constructor(private updateDuesCronService: UpdateDuesCronService) {}

  public async runAsync(): Promise<void> {
    await this.updateDuesCronService.executeTaskAsync();
  }
}
