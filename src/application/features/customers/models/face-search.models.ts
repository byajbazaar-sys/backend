import { Expose } from 'class-transformer';

export class FaceLibraryStatusModel {
  @Expose()
  ready: boolean;

  @Expose()
  progressPercent: number;

  @Expose()
  checked: number;

  @Expose()
  total: number;

  @Expose()
  searchable: number;

  @Expose()
  statusText: string;
}

export class FaceMatchResultModel {
  @Expose()
  customerId: string;

  @Expose()
  customerName: string;

  @Expose()
  profilePhotoUrl?: string;

  @Expose()
  score: number;
}

export class FaceSearchResponseModel {
  @Expose()
  matches: FaceMatchResultModel[];
}

export class FaceLibrarySyncResponseModel extends FaceLibraryStatusModel {
  @Expose()
  indexed: number;

  @Expose()
  skipped: number;

  @Expose()
  failed: number;
}
