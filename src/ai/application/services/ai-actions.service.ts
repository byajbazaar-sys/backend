import {
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { toActionView } from './ai-action-view';
import {
  actionPayloadHash,
  actorCan,
  AiActionView,
  AiActor,
  AiBusinessError,
  AiPendingAction,
  EAiActionStatus,
  EAiAuditEvent,
} from '../domain';
import {
  AI_ACTIONS_REPOSITORY,
  AI_ACTIVITY_LOG,
  AI_AUDIT_LOG,
  AI_EXECUTIONS_REPOSITORY,
  AI_MESSAGES_REPOSITORY,
  IAiActionsRepository,
  IAiActivityLog,
  IAiAuditLog,
  IAiExecutionsRepository,
  IAiMessagesRepository,
} from '../ports';
import { AiToolRegistry, isWriteTool } from '../tools';

/**
 * Confirming and cancelling previews. A confirmation runs the stored payload only — never anything the client sends
 * — and only when: it belongs to this person in this shop, it has not expired, its hash still matches the one the
 * person saw, and the person still has the access the tool needs right now. A compare-and-set on the status plus a
 * unique execution key make sure it runs at most once, even with double taps or retries.
 */
@Injectable()
export class AiActionsService {
  constructor(
    private readonly registry: AiToolRegistry,
    @Inject(AI_ACTIONS_REPOSITORY) private readonly actions: IAiActionsRepository,
    @Inject(AI_EXECUTIONS_REPOSITORY) private readonly executions: IAiExecutionsRepository,
    @Inject(AI_MESSAGES_REPOSITORY) private readonly messages: IAiMessagesRepository,
    @Inject(AI_AUDIT_LOG) private readonly audit: IAiAuditLog,
    @Inject(AI_ACTIVITY_LOG) private readonly activity: IAiActivityLog,
    @InjectPinoLogger(AiActionsService.name) private readonly logger: PinoLogger,
  ) {}

  async get(actor: AiActor, id: string): Promise<AiActionView> {
    return toActionView(await this.require(actor, id));
  }

  async confirm(actor: AiActor, id: string, payloadHash: string): Promise<AiActionView> {
    const now = new Date();
    const action = await this.require(actor, id);

    if (action.status === EAiActionStatus.Completed) return toActionView(action, now); // already done: same answer
    this.assertOpen(action, now);
    if (action.expiresAt.getTime() <= now.getTime()) {
      await this.expire(action);
      throw new GoneException({
        code: 'AI_ACTION_EXPIRED',
        message: 'This preview expired. Ask again to get a fresh one.',
      });
    }

    const expected = actionPayloadHash({
      action: action.action,
      parameters: action.parameters,
      shopId: action.shopId,
      actorUserId: action.actorUserId,
    });
    if (payloadHash !== action.payloadHash || expected !== action.payloadHash) {
      await this.audit.record({
        event: EAiAuditEvent.ActionRefused,
        ...who(action),
        data: { reason: 'payload_mismatch' },
      });
      throw new ConflictException({
        code: 'AI_ACTION_CHANGED',
        message: 'This preview has changed. Check the latest preview and confirm again.',
      });
    }

    const tool = this.registry.get(action.action);
    if (!tool || !isWriteTool(tool)) {
      await this.fail(action, 'This action is no longer supported.');
      throw new ConflictException({ code: 'AI_ACTION_UNSUPPORTED', message: 'This action is no longer supported.' });
    }
    // Access is checked again now: a role change since the preview counts.
    if (tool.permission.module && !actorCan(actor, tool.permission.module, tool.permission.level)) {
      await this.audit.record({ event: EAiAuditEvent.ActionRefused, ...who(action), data: { reason: 'permission' } });
      throw new ForbiddenException({
        code: 'AI_ACTION_FORBIDDEN',
        message: "You don't have permission to do this in this shop.",
      });
    }
    const parameters = tool.parameters.safeParse(action.parameters);
    if (!parameters.success) {
      await this.fail(action, 'The prepared details are no longer valid.');
      throw new UnprocessableEntityException({
        code: 'AI_ACTION_INVALID',
        message: 'The prepared details are no longer valid. Ask again.',
      });
    }

    const claimed = await this.actions.transition(action.id, {
      from: [EAiActionStatus.AwaitingConfirmation],
      to: EAiActionStatus.Executing,
      payloadHash: action.payloadHash,
      notExpiredAt: now,
      set: { approvedAt: now, executedAt: now },
    });
    if (!claimed) return this.afterLostRace(actor, action.id);

    const execution = await this.executions.start(action.id, `ai-action:${action.id}`);
    if (!execution) return this.afterLostRace(actor, action.id);
    await this.audit.record({
      event: EAiAuditEvent.ActionApproved,
      ...who(action),
      data: { lifecycle: [EAiActionStatus.Approved, EAiActionStatus.Executing] },
    });

    const started = Date.now();
    try {
      const result = await tool.execute(parameters.data, { actor, conversationId: action.conversationId ?? '', now });
      const output = tool.output.safeParse(result.data ?? {});
      if (!output.success) this.logger.warn({ action: action.action }, 'AI action result off its output schema');
      const completed = await this.actions.transition(action.id, {
        from: [EAiActionStatus.Executing],
        to: EAiActionStatus.Completed,
        set: {
          completedAt: new Date(),
          entityId: result.entityId ?? null,
          result: { summary: result.summary, data: result.data, card: result.card },
        },
      });
      await this.executions.finish(execution.id, {
        status: 'COMPLETED',
        result: result.data,
        durationMs: Date.now() - started,
      });
      await this.audit.record({
        event: EAiAuditEvent.ActionCompleted,
        ...who(action),
        data: { entityType: result.entityType, entityId: result.entityId ?? null, durationMs: Date.now() - started },
      });
      await this.activity.record({
        action: `AI_${action.action.replace(/[.-]/g, '_').toUpperCase()}`.slice(0, 60),
        entityType: result.entityType,
        entityId: result.entityId ?? null,
        shopId: action.shopId,
        performedBy: action.actorUserId,
        channel: actor.channel,
        data: { aiActionId: action.id },
      });
      await this.note(action, `The person confirmed ${action.action} (action ${action.id}). Done: ${result.summary}`);
      return toActionView(completed ?? { ...action, status: EAiActionStatus.Completed });
    } catch (err) {
      const message =
        err instanceof AiBusinessError
          ? err.message
          : 'Something went wrong while saving. Check the record before trying again.';
      if (!(err instanceof AiBusinessError)) this.logger.error({ err, actionId: action.id }, 'AI action failed');
      await this.actions.transition(action.id, {
        from: [EAiActionStatus.Executing],
        to: EAiActionStatus.Failed,
        set: { error: message },
      });
      await this.executions.finish(execution.id, {
        status: 'FAILED',
        error: message,
        durationMs: Date.now() - started,
      });
      await this.audit.record({
        event: EAiAuditEvent.ActionFailed,
        ...who(action),
        data: { business: err instanceof AiBusinessError },
      });
      await this.note(action, `The person confirmed ${action.action} (action ${action.id}), but it failed: ${message}`);
      if (err instanceof AiBusinessError) {
        throw new UnprocessableEntityException({ code: 'AI_ACTION_FAILED', message, details: err.details });
      }
      throw new HttpException({ statusCode: 502, code: 'AI_ACTION_FAILED', message }, 502);
    }
  }

  async cancel(actor: AiActor, id: string): Promise<AiActionView> {
    const action = await this.require(actor, id);
    if (action.status === EAiActionStatus.Cancelled) return toActionView(action);
    const cancelled = await this.actions.transition(action.id, {
      from: [EAiActionStatus.AwaitingConfirmation],
      to: EAiActionStatus.Cancelled,
    });
    if (!cancelled) {
      const latest = await this.require(actor, id);
      if (latest.status === EAiActionStatus.Cancelled) return toActionView(latest);
      throw new ConflictException({
        code: 'AI_ACTION_DECIDED',
        message: `This preview is already ${latest.status.toLowerCase().replace('_', ' ')}.`,
      });
    }
    await this.audit.record({ event: EAiAuditEvent.ActionCancelled, ...who(action) });
    await this.note(action, `The person cancelled ${action.action} (action ${action.id}); nothing was saved.`);
    return toActionView(cancelled);
  }

  private async require(actor: AiActor, id: string): Promise<AiPendingAction> {
    const action = await this.actions.findForActor(id, actor.shopId, actor.actorUserId);
    if (!action) throw new NotFoundException('Action not found');
    return action;
  }

  private assertOpen(action: AiPendingAction, now: Date): void {
    switch (action.status) {
      case EAiActionStatus.AwaitingConfirmation:
        return;
      case EAiActionStatus.Executing:
      case EAiActionStatus.Approved:
        throw new ConflictException({ code: 'AI_ACTION_RUNNING', message: 'This is already being saved.' });
      case EAiActionStatus.Cancelled:
        throw new ConflictException({ code: 'AI_ACTION_DECIDED', message: 'This preview was cancelled.' });
      case EAiActionStatus.Failed:
        throw new ConflictException({
          code: 'AI_ACTION_DECIDED',
          message: action.error ?? 'This action failed. Ask again.',
        });
      case EAiActionStatus.Expired:
        throw new GoneException({
          code: 'AI_ACTION_EXPIRED',
          message: 'This preview expired. Ask again to get a fresh one.',
        });
      default:
        if (action.expiresAt.getTime() <= now.getTime()) {
          throw new GoneException({ code: 'AI_ACTION_EXPIRED', message: 'This preview expired.' });
        }
        throw new ConflictException({ code: 'AI_ACTION_DECIDED', message: 'This preview can no longer be confirmed.' });
    }
  }

  /** Another request claimed it first: report where it ended up instead of running it again. */
  private async afterLostRace(actor: AiActor, id: string): Promise<AiActionView> {
    const latest = await this.require(actor, id);
    if (latest.status === EAiActionStatus.Completed) return toActionView(latest);
    this.assertOpen(latest, new Date());
    throw new ConflictException({ code: 'AI_ACTION_RUNNING', message: 'This is already being saved.' });
  }

  private async expire(action: AiPendingAction): Promise<void> {
    const expired = await this.actions.transition(action.id, {
      from: [EAiActionStatus.AwaitingConfirmation],
      to: EAiActionStatus.Expired,
    });
    if (expired) await this.audit.record({ event: EAiAuditEvent.ActionExpired, ...who(action) });
  }

  private async fail(action: AiPendingAction, message: string): Promise<void> {
    await this.actions.transition(action.id, {
      from: [EAiActionStatus.AwaitingConfirmation],
      to: EAiActionStatus.Failed,
      set: { error: message },
    });
    await this.audit.record({ event: EAiAuditEvent.ActionFailed, ...who(action), data: { reason: message } });
  }

  /** Tells the model, on the next turn, what became of the preview (the history stays append-only). */
  private async note(action: AiPendingAction, text: string): Promise<void> {
    if (!action.conversationId) return;
    try {
      await this.messages.appendEvent(action.conversationId, [{ type: 'text', text }]);
    } catch (err) {
      this.logger.warn({ err, actionId: action.id }, 'Could not add the action event to the conversation');
    }
  }
}

const who = (action: AiPendingAction) => ({
  shopId: action.shopId,
  actorUserId: action.actorUserId,
  conversationId: action.conversationId,
  actionId: action.id,
  action: action.action,
});
