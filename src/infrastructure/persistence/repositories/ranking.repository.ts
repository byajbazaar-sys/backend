import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IRankingRepository, Ranking } from '../../../application';
import { RankingDocument, RankingsSchema } from '../schemas/rankings.schema';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class RankingRepository implements IRankingRepository {
  constructor(@InjectModel(RankingsSchema.name) private rankingModel: Model<RankingDocument>) {}

  async createOrUpdateRanking(
    jobApplicationId: string,
    score: number,
    feedback: string,
    strengths: string[],
    areasForImprovement: string[],
    details?: Record<string, any>,
  ): Promise<Ranking> {
    const result = await this.rankingModel.findOneAndUpdate(
      { jobApplicationId: new Types.ObjectId(jobApplicationId) },
      {
        jobApplicationId: new Types.ObjectId(jobApplicationId),
        score,
        feedback,
        strengths,
        areasForImprovement,
        details,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (!result) {
      throw new Error('Failed to create or update ranking');
    }

    const ranking = plainToInstance(Ranking, result, {
      excludeExtraneousValues: true,
    });
    return ranking;
  }

  async getRankingByJobApplicationId(jobApplicationId: string): Promise<Ranking> {
    const result = await this.rankingModel.findOne({ jobApplicationId: new Types.ObjectId(jobApplicationId) }).lean();
    const ranking = plainToInstance(Ranking, result, {
      excludeExtraneousValues: true,
    });
    return ranking;
  }
}
