import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class StartVoiceSessionModel {
  @ApiPropertyOptional({ description: 'Continue this conversation by voice (omit for a new one).' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

const MAX_MS = 60 * 60_000;

/** A transcribed (or typed) turn from the voice gateway. */
export class VoiceGatewayTurnModel {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{8,64}$/) utteranceId: string;
  @ApiProperty({ enum: ['speech', 'text'] }) @IsIn(['speech', 'text']) kind: 'speech' | 'text';
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) text: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(12) language?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) confidence?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() conversationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) page?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MAX_MS) audioMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MAX_MS) partialAudioMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sttRequests?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MAX_MS) sttLatencyMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sttErrors?: number;
}

/** Usage the gateway reports outside a turn (speech output, failed transcriptions). */
export class VoiceGatewayUsageModel {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1_000_000) ttsChars?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) ttsRequests?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MAX_MS) ttsLatencyMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) ttsErrors?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MAX_MS) partialAudioMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) sttRequests?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MAX_MS) sttLatencyMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) sttErrors?: number;
}

export class VoiceGatewayCloseModel {
  @ApiProperty() @IsString() @Matches(/^[a-z_]{2,40}$/) reason: string;
}
