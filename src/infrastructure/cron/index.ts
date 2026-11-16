import { CloseExpiredLoansCronService } from './close-expired-loans.cron.service';
import { CronService } from './cron.service';
import { RelayLogsCronService } from './relay-logs.cron.service';
import { UpdateDuesCronService } from './update-dues.cron.service';

export * from './cron.service';
export * from './update-dues.cron.service';
export * from './close-expired-loans.cron.service';
export * from './relay-logs.cron.service';

export default [CronService, UpdateDuesCronService, CloseExpiredLoansCronService, RelayLogsCronService];
