import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { AI_KNOWLEDGE_COLLECTIONS, AiKnowledgeCollection } from '../../ai.config';
import { AI_LANGUAGES, AI_REPLY_STYLES, AI_SPEECH_LANGUAGES, AI_VOICES } from '../domain';

export class AiChatRequestModel {
  @ApiProperty({ example: 'Create silver payal 5 gram 70% purity', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ description: 'Continue this conversation (omit to start a new one).' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Client id of this message (uuid). A retry with the same id returns the first answer.',
  })
  @IsOptional()
  @IsUUID()
  clientMessageId?: string;

  @ApiPropertyOptional({ example: '/inventory', description: 'The screen the person is on.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^\/[a-zA-Z0-9/_-]*$/)
  page?: string;
}

export class ConfirmAiActionRequestModel {
  @ApiProperty({
    description: 'payloadHash of the preview being confirmed (binds the approval to that exact payload).',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  payloadHash: string;
}

export class ListAiConversationsQueryModel {
  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Only conversations active before this time (paging).' })
  @IsOptional()
  @IsDateString()
  before?: string;
}

export class CreateAiKnowledgeDocumentModel {
  @ApiProperty({ enum: AI_KNOWLEDGE_COLLECTIONS })
  @IsIn(AI_KNOWLEDGE_COLLECTIONS)
  collection: AiKnowledgeCollection;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ enum: ['en', 'hi', 'hinglish', 'mixed'] })
  @IsIn(['en', 'hi', 'hinglish', 'mixed'])
  language: string;

  @ApiProperty({ description: 'Markdown or plain text (up to 100,000 characters).' })
  @IsString()
  @MinLength(20)
  @MaxLength(100_000)
  content: string;
}

export class ReindexAiKnowledgeModel {
  @ApiPropertyOptional({ enum: AI_KNOWLEDGE_COLLECTIONS, description: 'Omit to rebuild every collection.' })
  @IsOptional()
  @IsIn(AI_KNOWLEDGE_COLLECTIONS)
  collection?: AiKnowledgeCollection;
}

/** A queue delivery (QStash). */
export class AiJobModel {
  @ApiProperty({ enum: ['knowledge.reindex', 'conversation.summarize', 'maintenance.purge', 'voice.prewarm'] })
  @IsIn(['knowledge.reindex', 'conversation.summarize', 'maintenance.purge', 'voice.prewarm'])
  type: 'knowledge.reindex' | 'conversation.summarize' | 'maintenance.purge' | 'voice.prewarm';

  @ApiPropertyOptional({ enum: AI_KNOWLEDGE_COLLECTIONS })
  @IsOptional()
  @IsIn(AI_KNOWLEDGE_COLLECTIONS)
  collection?: AiKnowledgeCollection;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  uptoTurn?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

/** Every field is optional: what is left out keeps its saved value. */
export class UpdateAiPreferencesModel {
  @ApiPropertyOptional({ enum: AI_LANGUAGES, description: 'auto = the language of each message' })
  @IsOptional()
  @IsIn(AI_LANGUAGES as unknown as string[])
  language?: (typeof AI_LANGUAGES)[number];

  @ApiPropertyOptional({ enum: AI_REPLY_STYLES })
  @IsOptional()
  @IsIn(AI_REPLY_STYLES as unknown as string[])
  replyStyle?: (typeof AI_REPLY_STYLES)[number];

  @ApiPropertyOptional({ description: 'Voice: read English replies aloud' })
  @IsOptional()
  @IsBoolean()
  speakReplies?: boolean;

  @ApiPropertyOptional({ enum: AI_SPEECH_LANGUAGES, description: 'Voice: speech language hint (auto = detect)' })
  @IsOptional()
  @IsIn(AI_SPEECH_LANGUAGES as unknown as string[])
  speechLanguage?: (typeof AI_SPEECH_LANGUAGES)[number];

  @ApiPropertyOptional({ enum: AI_VOICES, description: 'Voice: Aura-2 English speaker' })
  @IsOptional()
  @IsIn(AI_VOICES as unknown as string[])
  voice?: (typeof AI_VOICES)[number];
}
