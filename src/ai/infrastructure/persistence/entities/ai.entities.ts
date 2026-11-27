import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * AI database tables (AI_DB_*; snake_case columns via SnakeNamingStrategy). shop_id / actor_user_id refer to users
 * in the main database: there are no cross-database foreign keys, so the audit trail outlives what it describes.
 * The schema itself is created by the migrations, never by `synchronize`.
 */

@Entity('ai_conversations')
export class AiConversationEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') shopId: string;
  @Column('uuid') actorUserId: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) title: string | null;
  @Column({ type: 'int', default: 0 }) turnCount: number;
  @Column({ type: 'text', nullable: true }) summary: string | null;
  @Column({ type: 'int', default: 0 }) summaryUptoTurn: number;
  @Column({ type: 'timestamptz', nullable: true }) lastMessageAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('ai_messages')
export class AiMessageEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') conversationId: string;
  @Column('int') turnIndex: number;
  @Column('int') seq: number;
  @Column({ type: 'varchar', length: 12 }) role: string;
  @Column({ type: 'jsonb' }) content: unknown;
  @Column({ type: 'varchar', length: 64, nullable: true }) clientMessageId: string | null;
  @Column({ type: 'jsonb', nullable: true }) response: unknown;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('ai_pending_actions')
export class AiPendingActionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) conversationId: string | null;
  @Column({ type: 'int', nullable: true }) turnIndex: number | null;
  @Column('uuid') shopId: string;
  @Column('uuid') actorUserId: string;
  @Column({ type: 'varchar', length: 64 }) action: string;
  @Column({ type: 'varchar', length: 16 }) intent: string;
  @Column({ type: 'jsonb' }) parameters: Record<string, unknown>;
  @Column({ type: 'jsonb' }) preview: unknown;
  @Column({ type: 'char', length: 64 }) payloadHash: string;
  @Column({ type: 'varchar', length: 24 }) status: string;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) approvedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) executedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @Column({ type: 'jsonb', nullable: true }) result: unknown;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) entityId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('ai_action_executions')
export class AiActionExecutionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') actionId: string;
  @Column({ type: 'varchar', length: 100 }) idempotencyKey: string;
  @Column({ type: 'varchar', length: 16 }) status: string;
  @Column({ type: 'timestamptz' }) startedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
  @Column({ type: 'jsonb', nullable: true }) result: unknown;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'int', nullable: true }) durationMs: number | null;
}

@Entity('ai_audit_logs')
export class AiAuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 40 }) event: string;
  @Column({ type: 'uuid', nullable: true }) shopId: string | null;
  @Column({ type: 'uuid', nullable: true }) actorUserId: string | null;
  @Column({ type: 'uuid', nullable: true }) conversationId: string | null;
  @Column({ type: 'uuid', nullable: true }) actionId: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) action: string | null;
  @Column({ type: 'jsonb', nullable: true }) data: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('ai_usage_logs')
export class AiUsageLogEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) shopId: string | null;
  @Column({ type: 'uuid', nullable: true }) actorUserId: string | null;
  @Column({ type: 'uuid', nullable: true }) conversationId: string | null;
  @Column({ type: 'varchar', length: 20 }) kind: string;
  @Column({ type: 'varchar', length: 20 }) provider: string;
  @Column({ type: 'varchar', length: 80 }) model: string;
  @Column({ type: 'int', default: 0 }) inputTokens: number;
  @Column({ type: 'int', default: 0 }) outputTokens: number;
  @Column({ type: 'int', default: 0 }) cacheReadTokens: number;
  @Column({ type: 'int', default: 0 }) cacheWriteTokens: number;
  @Column({ type: 'int', default: 0 }) latencyMs: number;
  @Column({ type: 'int', default: 0 }) toolCalls: number;
  @Column({ type: 'varchar', length: 20 }) outcome: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('ai_knowledge_documents')
export class AiKnowledgeDocumentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 40 }) collection: string;
  @Column({ type: 'varchar', length: 120 }) docKey: string;
  @Column({ type: 'uuid', nullable: true }) shopId: string | null;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column({ type: 'varchar', length: 12 }) language: string;
  @Column({ type: 'varchar', length: 12 }) source: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) storageKey: string | null;
  @Column({ type: 'char', length: 64 }) contentHash: string;
  @Column({ type: 'int', default: 0 }) chunkCount: number;
  @Column({ type: 'int', nullable: true }) indexedVersion: number | null;
  @Column({ type: 'timestamptz', nullable: true }) indexedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('ai_user_preferences')
export class AiUserPreferencesEntity {
  @PrimaryColumn('uuid') actorUserId: string;
  @Column({ type: 'varchar', length: 16, default: 'auto' }) language: string;
  @Column({ type: 'varchar', length: 16, default: 'short' }) replyStyle: string;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export const AI_ENTITY_CLASSES = [
  AiConversationEntity,
  AiMessageEntity,
  AiPendingActionEntity,
  AiActionExecutionEntity,
  AiAuditLogEntity,
  AiUsageLogEntity,
  AiKnowledgeDocumentEntity,
  AiUserPreferencesEntity,
];
