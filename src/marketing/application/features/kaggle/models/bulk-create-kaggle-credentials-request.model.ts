import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';

import { CreateKaggleCredentialRequestModel } from './create-kaggle-credential-request.model';

export class BulkCreateKaggleCredentialsRequestModel {
  @ApiProperty({ type: [CreateKaggleCredentialRequestModel], maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateKaggleCredentialRequestModel)
  accounts: CreateKaggleCredentialRequestModel[];
}
