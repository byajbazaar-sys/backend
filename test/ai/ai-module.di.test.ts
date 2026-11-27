/**
 * Boots the real AiModule with stand-ins for the ByajBazaar services it imports, so a wiring mistake (missing
 * provider, wrong token, import cycle) fails here instead of on a Lambda cold start. No database or network is used:
 * the AI database, Qdrant and Workers AI are only reached on use.
 */
import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AUTHENTICATION_ORCHESTRATOR, SUBSCRIPTION_ACCESS_CHECKER } from '@shared-libs';
import { LoggerModule } from 'nestjs-pino';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AiModule } from '../../src/ai';
import { AiOrchestratorService, AiToolRegistry, AI_LANGUAGE_MODEL, IAiLanguageModel } from '../../src/ai/application';
import {
  ACTIVITY_LOGGER,
  CLOUDFLARE_ACCOUNT_POOL,
  CUSTOMER_SERVICE,
  DEPOSIT_SERVICE,
  INVENTORY_CATEGORY_SERVICE,
  INVENTORY_ITEM_SERVICE,
  INVENTORY_REPORT_SERVICE,
  ITEM_SERVICE,
  LOAN_SERVICE,
  TRANSACTION_SERVICE,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
  WEBSOCKET_MESSAGE_SERVICE,
} from '../../src/application';

const HOST_TOKENS = [
  INVENTORY_ITEM_SERVICE,
  INVENTORY_CATEGORY_SERVICE,
  INVENTORY_REPORT_SERVICE,
  CUSTOMER_SERVICE,
  LOAN_SERVICE,
  TRANSACTION_SERVICE,
  ITEM_SERVICE,
  DEPOSIT_SERVICE,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
  WEBSOCKET_MESSAGE_SERVICE,
  CLOUDFLARE_ACCOUNT_POOL,
  ACTIVITY_LOGGER,
  AUTHENTICATION_ORCHESTRATOR,
  SUBSCRIPTION_ACCESS_CHECKER,
];

@Global()
@Module({
  providers: HOST_TOKENS.map((token) => ({ provide: token, useValue: {} })),
  exports: HOST_TOKENS,
})
class HostStubs {}

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    HostStubs,
    AiModule,
  ],
})
class TestRoot {}

describe('AiModule wiring', () => {
  it('resolves every provider and registers the tools', async () => {
    const app = await NestFactory.createApplicationContext(TestRoot, { logger: false, abortOnError: false });
    try {
      assert.ok(app.get(AiOrchestratorService));
      const actions = app
        .get(AiToolRegistry)
        .all()
        .map((t) => t.action)
        .sort();
      assert.deepEqual(actions, [
        'app.navigate',
        'customers.create',
        'customers.search',
        'deposits.add',
        'deposits.search',
        'dues.list',
        'inventory.create',
        'inventory.get',
        'inventory.search',
        'inventory.summary',
        'inventory.update',
        'knowledge.search',
        'loans.create',
        'loans.search',
        'payments.record',
        'reports.overview',
      ]);
      const model = app.get<IAiLanguageModel>(AI_LANGUAGE_MODEL);
      assert.equal(model.provider, 'workers-ai');
      assert.equal(model.model, '@cf/google/gemma-4-26b-a4b-it');
    } finally {
      await app.close();
    }
  });
});
