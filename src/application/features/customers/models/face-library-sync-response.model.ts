import { Expose } from 'class-transformer';

import { FaceLibraryStatusModel } from './face-library-status.model';

export class FaceLibrarySyncResponseModel extends FaceLibraryStatusModel {
  @Expose()
  indexed: number;

  @Expose()
  skipped: number;

  @Expose()
  failed: number;
}
