import {
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
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async deliver(@Req() req: Request & { rawBody?: Buffer }, @Body() body: AiJobModel): Promise<{ ok: true }> {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!(await this.queue.verify(req.header('upstash-signature'), raw))) {
      throw new UnauthorizedException('Invalid queue signature');
    }
    await this.jobs.run(toJob(body));
    return { ok: true };
  }
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

function toJob(body: AiJobModel): AiJob {
  switch (body.type) {
    case 'knowledge.reindex':
      return { type: 'knowledge.reindex', collection: body.collection, requestedBy: body.requestedBy ?? null };
    case 'conversation.summarize':
      if (!body.conversationId || !body.uptoTurn) throw new UnauthorizedException('Invalid job');
      return { type: 'conversation.summarize', conversationId: body.conversationId, uptoTurn: body.uptoTurn };
    case 'maintenance.purge':
      return { type: 'maintenance.purge' };
  }
}
