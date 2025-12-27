import { Injectable } from '@nestjs/common';
import { IJobApplicationRepository, JobApplication } from '../../../application';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JobApplicationsSchema } from '../schemas';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class JobApplicationRepository implements IJobApplicationRepository {
  constructor(@InjectModel(JobApplicationsSchema.name) private jobApplicationModel: Model<JobApplicationsSchema>) {}

  async createJobApplication(jobApplication: JobApplication): Promise<JobApplication> {
    const createdJobApplication = await this.jobApplicationModel.create({
      ...jobApplication,
      jobId: new Types.ObjectId(jobApplication.jobId),
    });
    return plainToInstance(JobApplication, createdJobApplication, {
      excludeExtraneousValues: true,
    });
  }

  async updateJobApplicationAnswers(id: string, answers: string[]): Promise<JobApplication | null> {
    const updatedJobApplication = await this.jobApplicationModel.findByIdAndUpdate(
      new Types.ObjectId(id),
      { answers },
      { new: true },
    );
    return plainToInstance(JobApplication, updatedJobApplication, {
      excludeExtraneousValues: true,
    });
  }

  async getJobApplications(params: {
    pageNumber?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    jobId?: string;
  }): Promise<{ items: JobApplication[]; total: number; pageNumber: number; pageSize: number }> {
    const pageNumber = params?.pageNumber && params.pageNumber > 0 ? params.pageNumber : 1;
    const pageSize = params?.pageSize && params.pageSize > 0 ? params.pageSize : 10;
    const skip = (pageNumber - 1) * pageSize;

    const query: any = {};
    if (params.jobId) {
      query.jobId = new Types.ObjectId(params.jobId);
    }

    const sort: Record<string, 1 | -1> = {};
    if (params.sortBy) {
      sort[params.sortBy] = params.sortDir === 'asc' ? 1 : -1;
    } else {
      sort['createdAt'] = -1; // Default sort by creation date
    }

    const pipeline = [
      {
        $match: query,
      },
      {
        $facet: {
          items: [
            { $sort: sort },
            { $skip: (pageNumber - 1) * pageSize },
            { $limit: pageSize },
            {
              $lookup: {
                from: 'rankings',
                localField: '_id',
                foreignField: 'jobApplicationId',
                as: 'ranking',
              },
            },
            {
              $unwind: {
                path: '$ranking',
                preserveNullAndEmptyArrays: true,
              }
            }
          ],
          meta: [{ $count: 'total' }],
        },
      },
    ];

    const result = await this.jobApplicationModel.aggregate(pipeline);
    console.log('repo getJobApplications result:', JSON.stringify(result, null, 2));
    const items = result[0].items;
    const total = result[0].meta[0].total;

    return {
      items: items.map((item) => plainToInstance(JobApplication, item, { excludeExtraneousValues: true })),
      total,
      pageNumber,
      pageSize,
    };
  }

  async getJobApplicationById(id: string): Promise<JobApplication | null> {
    const application = await this.jobApplicationModel.findById(new Types.ObjectId(id)).lean();
    if (!application) return null;

    return plainToInstance(JobApplication, application, {
      excludeExtraneousValues: true,
    });
  }
}
