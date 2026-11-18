import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
export class SceneIndexParamModel {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  index: number;
}
