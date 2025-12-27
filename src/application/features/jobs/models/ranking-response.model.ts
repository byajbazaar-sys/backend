import { Expose } from 'class-transformer';

export class RankingResponseModel {
  @Expose()
  id: string;

  @Expose()
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
