import { CronJob } from "cron";
import { PinoLogger } from "nestjs-pino";
import { SchedulerRegistry } from "@nestjs/schedule";
import { Injectable, OnModuleInit } from "@nestjs/common";

@Injectable()
export abstract class BaseCronService implements OnModuleInit {
  protected constructor(protected readonly schedulerRegistry: SchedulerRegistry, protected readonly logger: PinoLogger) {
    this.logger = logger;
  }

  public onModuleInit(): void {
    const job = new CronJob(
      this.getCronTime(),
      async (): Promise<void> => {
        this.logger.info(`Running CRON job: ${this.getJobName()}`);
        try {
          await this.executeTaskAsync();
        } catch (ex) {
          this.logger.error(`Error running CRON job: ${this.getJobName()}`);
          this.logger.error(ex);
        }
      },
      null,
      true,
      this.getTimeZone(),
    );

    this.schedulerRegistry.addCronJob(this.getJobName(), job as any);
    job.start();
  }

  public abstract executeTaskAsync(): Promise<void>;
  protected getTimeZone(): string {
    return "Asia/Kolkata"; // India Standard Time
  }
  protected abstract getCronTime(): string;
  protected abstract getJobName(): string;
}
