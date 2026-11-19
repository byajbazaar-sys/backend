import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class CloudflareAccountsSummaryResponseModel {
  @ApiProperty({ enum: ['database', 'env', 'none'], description: 'Where Workers AI calls take their accounts from' })
  @Expose()
  source: string;
  @ApiProperty({ description: 'Accounts in rotation now' }) @Expose() activeAccounts: number;
  @ApiProperty({ description: 'Accounts in CLOUDFLARE_API_TOKEN (used only while no account is added here)' })
  @Expose()
  envAccounts: number;
  @ApiProperty({ example: '@cf/black-forest-labs/flux-2-klein-9b' }) @Expose() model: string;
}
