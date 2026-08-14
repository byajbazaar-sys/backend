import { Injectable, Inject } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { BaseCronService } from '@shared-libs';
import { PinoLogger } from 'nestjs-pino';

import { ILoanService, LOAN_SERVICE } from '../../application';

@Injectable()
export class CloseExpiredLoansCronService extends BaseCronService {
  constructor(
    schedulerRegistry: SchedulerRegistry,
    logger: PinoLogger,
    @Inject(LOAN_SERVICE) private readonly loanService: ILoanService,
  ) {
    super(schedulerRegistry, logger);
  }

  public getCronTime(): CronExpression {
    return CronExpression.EVERY_DAY_AT_1AM;
  }

  public getJobName(): string {
    return CloseExpiredLoansCronService.name;
  }

  protected getTimeZone(): string {
    return 'Asia/Kolkata';
  }

  public async executeTaskAsync(): Promise<void> {
    try {
      await this.loanService.closeOpenLoansPastTenure();
    } catch (error) {
      this.logger.error(error);
    }
  }
}
