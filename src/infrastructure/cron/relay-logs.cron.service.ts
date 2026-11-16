import { Injectable } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { BaseCronService } from '@shared-libs';
import { PinoLogger } from 'nestjs-pino';

import { LogsMaintenanceService } from '../../logs';

/**
 * Logs service upkeep: moves logs waiting in the main-database outbox to the logs database and finishes / catches up
 * the copy of the old main-database log tables. No-op without a dedicated logs database (LOGS_DB_HOST).
 */
@Injectable()
export class RelayLogsCronService extends BaseCronService {
  /** Stays well inside the Lambda timeout; whatever is left is picked up by the next run. */
  private static readonly BUDGET_MS = 4 * 60 * 1000;

  constructor(
    schedulerRegistry: SchedulerRegistry,
    logger: PinoLogger,
    private readonly maintenance: LogsMaintenanceService,
  ) {
    super(schedulerRegistry, logger);
  }

  /** On Lambda the relayLogsCron function runs this job; an in-process timer would fire inside API invocations. */
  public onModuleInit(): void {
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) return;
    super.onModuleInit();
  }

  public getCronTime(): CronExpression {
    return CronExpression.EVERY_30_MINUTES;
  }

  public getJobName(): string {
    return RelayLogsCronService.name;
  }

  public async executeTaskAsync(): Promise<void> {
    await this.maintenance.run(RelayLogsCronService.BUDGET_MS);
  }
}
