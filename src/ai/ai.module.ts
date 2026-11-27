import { Module } from '@nestjs/common';

import { AiConfig } from './ai.config';
import {
  AI_ACTIONS_REPOSITORY,
  AI_ACTIVITY_LOG,
  AI_CUSTOMERS_GATEWAY,
  AI_DEPOSITS_GATEWAY,
  AI_LOANS_GATEWAY,
  AI_PREFERENCES_REPOSITORY,
  AI_PROGRESS_NOTIFIER,
  AI_AUDIT_LOG,
  AI_CONVERSATIONS_REPOSITORY,
  AI_DOCUMENT_STORAGE,
  AI_EMBEDDINGS,
  AI_EXECUTIONS_REPOSITORY,
  AI_INVENTORY_GATEWAY,
  AI_KNOWLEDGE_DOCUMENTS_REPOSITORY,
  AI_KNOWLEDGE_INDEX,
  AI_LANGUAGE_MODEL,
  AI_MESSAGES_REPOSITORY,
  AI_QUEUE,
  AI_USAGE_REPOSITORY,
  AiActionsService,
  AiAdminController,
  AiController,
  AiConversationsService,
  AiJobsService,
  AiKnowledgeService,
  AiOrchestratorService,
  AiQueueController,
  AiToolRegistry,
  appNavigateTool,
  customersTools,
  depositsTools,
  IAiCustomersGateway,
  IAiDepositsGateway,
  IAiInventoryGateway,
  IAiLoansGateway,
  inventoryTools,
  knowledgeSearchTool,
  loansTools,
  reportsOverviewTool,
} from './application';
import {
  AiActionsRepository,
  AiAuditLogRepository,
  AiConversationsRepository,
  AiDatabase,
  AiDocumentStorage,
  AiExecutionsRepository,
  AiKnowledgeDocumentsRepository,
  AiMessagesRepository,
  AiPreferencesRepository,
  AiUsageRepository,
  ByajBazaarAiProgressNotifier,
  ByajBazaarCustomersAdapter,
  ByajBazaarDepositsAdapter,
  ByajBazaarLoansAdapter,
  ByajBazaarAiActivityLogAdapter,
  ByajBazaarInventoryAdapter,
  ByajBazaarWorkersAiLanguageModel,
  ByajBazaarWorkersAiEmbeddings,
  loadAiSettings,
  QdrantKnowledgeIndex,
  QStashAiQueue,
} from './infrastructure';

/**
 * ByajBazaar AI — a self-contained bounded context, like logs and marketing:
 *  - own database (AI_DB_*, own migrations table `ai_migrations`), own Qdrant collections, own bucket prefix / bucket
 *    (AI_S3_*), own queue deliveries (QStash), settings from SSM on Lambda (serverless/ai-config.js);
 *  - one orchestrator (application/services) over a registry of tools (application/tools); the model (Workers AI on
 *    ByajBazaar's Cloudflare account pool) sits behind IAiLanguageModel;
 *  - depends on ByajBazaar only through application/ports, implemented by infrastructure/adapters — the only files
 *    that import ByajBazaar code. Business changes always go through ByajBazaar's own services.
 */
@Module({
  controllers: [AiController, AiQueueController, AiAdminController],
  providers: [
    {
      provide: AiConfig,
      useFactory: async (): Promise<AiConfig> => {
        await loadAiSettings();
        return new AiConfig();
      },
    },
    AiDatabase,
    { provide: AI_CONVERSATIONS_REPOSITORY, useClass: AiConversationsRepository },
    { provide: AI_MESSAGES_REPOSITORY, useClass: AiMessagesRepository },
    { provide: AI_ACTIONS_REPOSITORY, useClass: AiActionsRepository },
    { provide: AI_EXECUTIONS_REPOSITORY, useClass: AiExecutionsRepository },
    { provide: AI_AUDIT_LOG, useClass: AiAuditLogRepository },
    { provide: AI_USAGE_REPOSITORY, useClass: AiUsageRepository },
    { provide: AI_KNOWLEDGE_DOCUMENTS_REPOSITORY, useClass: AiKnowledgeDocumentsRepository },
    { provide: AI_PREFERENCES_REPOSITORY, useClass: AiPreferencesRepository },
    { provide: AI_LANGUAGE_MODEL, useClass: ByajBazaarWorkersAiLanguageModel },
    { provide: AI_EMBEDDINGS, useClass: ByajBazaarWorkersAiEmbeddings },
    { provide: AI_KNOWLEDGE_INDEX, useClass: QdrantKnowledgeIndex },
    { provide: AI_DOCUMENT_STORAGE, useClass: AiDocumentStorage },
    { provide: AI_QUEUE, useClass: QStashAiQueue },
    { provide: AI_INVENTORY_GATEWAY, useClass: ByajBazaarInventoryAdapter },
    { provide: AI_ACTIVITY_LOG, useClass: ByajBazaarAiActivityLogAdapter },
    { provide: AI_CUSTOMERS_GATEWAY, useClass: ByajBazaarCustomersAdapter },
    { provide: AI_LOANS_GATEWAY, useClass: ByajBazaarLoansAdapter },
    { provide: AI_DEPOSITS_GATEWAY, useClass: ByajBazaarDepositsAdapter },
    { provide: AI_PROGRESS_NOTIFIER, useClass: ByajBazaarAiProgressNotifier },
    AiKnowledgeService,
    {
      provide: AiToolRegistry,
      inject: [AI_INVENTORY_GATEWAY, AI_CUSTOMERS_GATEWAY, AI_LOANS_GATEWAY, AI_DEPOSITS_GATEWAY, AiKnowledgeService],
      useFactory: (
        inventory: IAiInventoryGateway,
        customers: IAiCustomersGateway,
        loans: IAiLoansGateway,
        deposits: IAiDepositsGateway,
        knowledge: AiKnowledgeService,
      ) =>
        new AiToolRegistry([
          ...inventoryTools(inventory),
          ...customersTools(customers),
          ...loansTools(customers, loans),
          ...depositsTools(customers, deposits),
          reportsOverviewTool(inventory, loans, deposits),
          appNavigateTool(),
          knowledgeSearchTool(knowledge),
        ]),
    },
    AiOrchestratorService,
    AiActionsService,
    AiConversationsService,
    AiJobsService,
  ],
  exports: [AiDatabase],
})
export class AiModule {}
