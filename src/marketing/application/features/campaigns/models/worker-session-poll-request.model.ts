import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** A warm Kaggle worker session asking for its next job (also its heartbeat). Authorised by the session token. */
export class WorkerSessionPollRequestModel {
  @ApiProperty() @IsUUID() sessionId: string;
  @ApiProperty() @IsString() @MaxLength(200) token: string;
  @ApiProperty({ description: 'Kaggle session seconds left' }) @IsInt() @Min(0) remainingSeconds: number;
  @ApiPropertyOptional({ enum: ['image', 'video'], nullable: true })
  @IsOptional()
  @IsIn(['image', 'video'])
  pipeline?: 'image' | 'video' | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() finishedJobId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) jobError?: string | null;
}
