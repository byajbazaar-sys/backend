import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** Never contains the token — only a masked hint. */
export class CloudflareAccountResponseModel {
  @ApiProperty() @Expose() id: string;
  @ApiPropertyOptional() @Expose() label: string | null;
  @ApiProperty() @Expose() accountId: string;
  @ApiProperty({ example: 'cfat…9f3a' }) @Expose() maskedToken: string;
  @ApiProperty({ description: 'False when no token is stored — re-enter it' })
  @Expose()
  tokenReadable: boolean;
  @ApiProperty() @Expose() enabled: boolean;
  @ApiProperty({ enum: ['ACTIVE', 'COOLDOWN', 'NO_TOKEN', 'DISABLED'] }) @Expose() status: string;
  @ApiPropertyOptional({ description: 'Skipped until then (daily quota used up, or token rejected)' })
  @Expose()
  cooldownUntil: Date | null;
  @ApiPropertyOptional() @Expose() lastError: string | null;
  @ApiPropertyOptional() @Expose() lastUsedAt: Date | null;
  @ApiProperty() @Expose() createdAt: Date;
  @ApiProperty() @Expose() updatedAt: Date;
}
