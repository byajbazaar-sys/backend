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
