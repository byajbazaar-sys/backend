import { UpdateDuesCronService } from './update-dues.cron.service';
import { CloseExpiredLoansCronService } from './close-expired-loans.cron.service';
import { CronService } from './cron.service';

export * from './cron.service';
export * from './update-dues.cron.service';
export * from './close-expired-loans.cron.service';

export default [CronService, UpdateDuesCronService, CloseExpiredLoansCronService];
