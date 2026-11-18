import { Expose } from 'class-transformer';

import { FaceMatchResultModel } from './face-match-result.model';

export class FaceSearchResponseModel {
  @Expose()
  matches: FaceMatchResultModel[];
}
