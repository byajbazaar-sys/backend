import { Ranking } from '../domains';

export const RANKING_REPOSITORY = 'RankingRepository';

export interface IRankingRepository {
  createOrUpdateRanking(
    jobApplicationId: string,
    score: number,
    feedback: string,
    strengths: string[],
    areasForImprovement: string[],
    details?: Record<string, any>,
  ): Promise<Ranking>;

  getRankingByJobApplicationId(jobApplicationId: string): Promise<Ranking>;
}
