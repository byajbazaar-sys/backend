import { CloseExpiredLoansCronService } from './close-expired-loans.cron.service';
import { CronService } from './cron.service';
import { RelayLogsCronService } from './relay-logs.cron.service';
import { UpdateDuesCronService } from './update-dues.cron.service';

/** Cron jobs registered by InfrastructureModule. */
export const CRON_SERVICES = [CronService, UpdateDuesCronService, CloseExpiredLoansCronService, RelayLogsCronService];
