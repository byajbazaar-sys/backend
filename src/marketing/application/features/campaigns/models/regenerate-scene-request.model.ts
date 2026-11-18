import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
export class RegenerateSceneRequestModel {
  @ApiProperty({ enum: ['image', 'video'], description: 'image = new image then new video; video = new video only' })
  @IsIn(['image', 'video'])
  target: 'image' | 'video';
}
