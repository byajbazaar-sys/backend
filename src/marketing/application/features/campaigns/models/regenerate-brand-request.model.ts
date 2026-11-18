import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
export class RegenerateBrandRequestModel {
  @ApiProperty({ enum: ['image', 'video', 'both'] })
  @IsIn(['image', 'video', 'both'])
  target: 'image' | 'video' | 'both';
}
