import { Expose, Transform } from 'class-transformer';

export class Ranking {
  @Expose()
  _id: string;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
  id: string;

  @Expose()
  @Transform(({ obj }) => obj?.jobApplicationId?.toString())
  jobApplicationId: string;

  @Expose()
  score: number;

  @Expose()
  feedback: string;

  @Expose()
  strengths: string[];

  @Expose()
  areasForImprovement: string[];

  @Expose()
  details?: Record<string, any>;
}
