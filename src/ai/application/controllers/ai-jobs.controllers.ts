import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, Identity, IIdentity, Roles, RolesGuard, UserAuthGuard } from '@shared-libs';
import { Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AiJobModel, CreateAiKnowledgeDocumentModel, ReindexAiKnowledgeModel } from '../models/ai-requests.model';
import { AI_QUEUE, AiJob, IAiQueue } from '../ports';
import { AiJobsService, AiKnowledgeService } from '../services';

/** Queue deliveries (QStash). Authorised by the Upstash-Signature header, not a user token. */
@ApiTags('ai')
@Controller('ai/queue')
export class AiQueueController {
  constructor(
    private readonly jobs: AiJobsService,
    @Inject(AI_QUEUE) private readonly queue: IAiQueue,
    @InjectPinoLogger(AiQueueController.name) private readonly logger: PinoLogger,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async deliver(@Req() req: Request & { rawBody?: Buffer }, @Body() body: AiJobModel): Promise<{ ok: true }> {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!(await this.queue.verify(req.header('upstash-signature'), raw))) {
      this.logger.warn({ type: body?.type }, 'AI queue delivery with an invalid signature');
      throw new UnauthorizedException('Invalid queue signature');
    }
    const job = toJob(body);
    const started = Date.now();
    try {
      const result = await this.jobs.run(job);
      this.logger.info({ type: job.type, ms: Date.now() - started, result: brief(result) }, 'AI queue job done');
    } catch (err) {
      // QStash retries it (Upstash-Retries).
      this.logger.error(
        { type: job.type, ms: Date.now() - started, err: (err as Error).message },
        'AI queue job failed',
      );
      throw err;
    }
    return { ok: true };
  }
}

/** A job's result for the log line: short, never the whole object. */
function brief(result: unknown): unknown {
  if (result === undefined || result === null || typeof result !== 'object') return result;
  const text = JSON.stringify(result);
  return text.length > 300 ? `${text.slice(0, 300)}…` : result;
}

/** Platform admins: the shared knowledge base and maintenance. */
@ApiTags('ai')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('ai/admin')
export class AiAdminController {
  constructor(
    private readonly knowledge: AiKnowledgeService,
    private readonly jobs: AiJobsService,
  ) {}

  @Get('knowledge')
  @Roles(EUserType.Admin)
  status() {
    return this.knowledge.status();
  }

  @Post('knowledge/documents')
  @Roles(EUserType.Admin)
  async addDocument(@Identity() identity: IIdentity, @Body() body: CreateAiKnowledgeDocumentModel) {
    const actor = identity.actorUserId ?? identity.userId;
    const document = await this.knowledge.addDocument({ ...body, createdBy: actor });
    const reindex = await this.jobs.submit({
      type: 'knowledge.reindex',
      collection: body.collection,
      requestedBy: actor,
    });
    return { document, reindex };
  }

  @Delete('knowledge/documents/:id')
  @Roles(EUserType.Admin)
  async removeDocument(@Identity() identity: IIdentity, @Param('id', new ParseUUIDPipe()) id: string) {
    const removed = await this.knowledge.removeDocument(id);
    if (!removed) throw new NotFoundException('Document not found');
    return this.jobs.submit({ type: 'knowledge.reindex', requestedBy: identity.actorUserId ?? identity.userId });
  }

  @Post('knowledge/reindex')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  reindex(@Identity() identity: IIdentity, @Body() body: ReindexAiKnowledgeModel) {
    return this.jobs.submit({
      type: 'knowledge.reindex',
      collection: body.collection,
      requestedBy: identity.actorUserId ?? identity.userId,
    });
  }

  @Post('maintenance/purge')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  purge() {
    return this.jobs.submit({ type: 'maintenance.purge' });
  }
}

/** The delivered body as a job. Every job type must be listed here (a missing one used to run `undefined`). */
export function toJob(body: AiJobModel): AiJob {
  switch (body.type) {
    case 'knowledge.reindex':
      return { type: 'knowledge.reindex', collection: body.collection, requestedBy: body.requestedBy ?? null };
    case 'conversation.summarize':
      if (!body.conversationId || !body.uptoTurn) throw new UnauthorizedException('Invalid job');
      return { type: 'conversation.summarize', conversationId: body.conversationId, uptoTurn: body.uptoTurn };
    case 'maintenance.purge':
      return { type: 'maintenance.purge' };
    case 'voice.prewarm':
      return { type: 'voice.prewarm' };
    default: {
      const unknown: never = body.type;
      throw new BadRequestException(`Unknown AI job type: ${String(unknown)}`);
    }
  }
}
