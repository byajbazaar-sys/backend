import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';

import { CreateCloudflareAccountRequestModel } from './create-cloudflare-account-request.model';

export class BulkCreateCloudflareAccountsRequestModel {
  @ApiProperty({ type: CreateCloudflareAccountRequestModel, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateCloudflareAccountRequestModel)
  accounts: CreateCloudflareAccountRequestModel[];
}
