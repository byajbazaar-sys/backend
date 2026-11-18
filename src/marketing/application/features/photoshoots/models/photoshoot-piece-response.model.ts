import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class PhotoshootPieceResponseModel {
  @Expose() @ApiProperty() noun: string;
  @Expose() @ApiProperty() metal: string;
  @Expose() @ApiProperty() wornOn: string;
}
