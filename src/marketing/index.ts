/** Public surface of the marketing module (used by AppModule and the Lambda / WebSocket handlers). */
export { MarketingModule } from './marketing.module';
export { MarketingRenderService } from './application/services/marketing-render.service';
export type { MarketingWorkerEvent } from './application/services/marketing-render.service';
export { MarketingQueueConsumer } from './application/services/marketing-queue.consumer';
export type { MarketingQueueMessage } from './application/ports';
export { MarketingDatabase } from './infrastructure/persistence/marketing-database';
