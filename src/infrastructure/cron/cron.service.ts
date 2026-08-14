import { Injectable } from '@nestjs/common';

import { CloseExpiredLoansCronService } from './close-expired-loans.cron.service';
import { UpdateDuesCronService } from './update-dues.cron.service';

/** EventBridge / serverless `detail.job` value for update dues Lambda. */
export const CRON_JOB_UPDATE_DUES = 'updateDues';
/** EventBridge / serverless `detail.job` value for close expired loans Lambda. */
export const CRON_JOB_CLOSE_EXPIRED_LOANS = 'closeExpiredLoans';

@Injectable()
export class CronService {
  constructor(
    private readonly updateDuesCronService: UpdateDuesCronService,
    private readonly closeExpiredLoansCronService: CloseExpiredLoansCronService,
  ) {}

  /**
   * Runs a single scheduled job (used by Lambda). Pass `job` from event detail, or omit for update dues (legacy default).
   */
  public async runAsync(job?: string): Promise<void> {
    if (job === CRON_JOB_CLOSE_EXPIRED_LOANS) {
      await this.closeExpiredLoansCronService.executeTaskAsync();
      return;
    }
    await this.updateDuesCronService.executeTaskAsync();
  }
}
