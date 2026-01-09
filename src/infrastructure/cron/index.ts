import { UpdateDuesCronService } from './update-dues.cron.service';
import { CronService } from './cron.service';

export * from './cron.service';
export * from './update-dues.cron.service';

export default [CronService, UpdateDuesCronService];
