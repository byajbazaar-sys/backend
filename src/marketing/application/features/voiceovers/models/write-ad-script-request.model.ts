import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

import { AD_SCRIPT_STYLES } from '../utils';

export class WriteAdScriptRequestModel {
  @ApiProperty({ description: 'The inventory item to advertise' })
  @IsUUID()
  inventoryItemId: string;

  @ApiProperty({ enum: AD_SCRIPT_STYLES, description: 'en = English, hi = Hindi, hinglish = Hinglish in Devanagari' })
  @IsIn(AD_SCRIPT_STYLES)
  style: string;
}
