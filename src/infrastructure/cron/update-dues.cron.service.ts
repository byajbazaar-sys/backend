import { Injectable, Inject } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { BaseCronService } from '@shared-libs';
import { PinoLogger } from 'nestjs-pino';

import { TRANSACTION_SERVICE, ITransactionService } from '../../application';

@Injectable()
export class UpdateDuesCronService extends BaseCronService {
  constructor(
    schedulerRegistry: SchedulerRegistry,
    logger: PinoLogger,
    @Inject(TRANSACTION_SERVICE) private readonly transactionService: ITransactionService,
  ) {
    super(schedulerRegistry, logger);
  }

  public getCronTime(): CronExpression {
    return CronExpression.EVERY_2_HOURS;
  }

  public getJobName(): string {
    return UpdateDuesCronService.name;
  }

  protected getTimeZone(): string {
    return 'Asia/Kolkata';
  }

  public async executeTaskAsync(): Promise<void> {
    try {
      await this.transactionService.updateDues();
    } catch (error) {
      this.logger.error(error);
    }
  }
}
