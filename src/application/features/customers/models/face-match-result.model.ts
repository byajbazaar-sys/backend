import { Expose } from 'class-transformer';
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
