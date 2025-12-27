import { InjectModel } from '@nestjs/mongoose';
import { Job, IJobRepository } from '../../../application';
import { Model, Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { JobsDocument, JobsSchema } from '../schemas';

export class JobsRepository implements IJobRepository {
  constructor(@InjectModel(JobsSchema.name) private activityModel: Model<JobsDocument>) {}

  async createJob(job: Job): Promise<Job> {
    const createdJob = await this.activityModel.create({
      ...job,
      createdBy: new Types.ObjectId(job.createdBy),
    });
    return plainToInstance(Job, createdJob.toJSON(), {
      excludeExtraneousValues: true,
    });
  }

  async listJobs(params: {
    skip: number;
    limit: number;
    sort?: Record<string, 1 | -1>;
    search?: string;
    type?: string;
  }): Promise<{ items: Job[]; total: number }> {
    const { skip, limit, sort, search, type } = params;
    const filter: Record<string, any> = {};

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [{ name: { $regex: q, $options: 'i' } }, { text: { $regex: q, $options: 'i' } }];
    }
    if (type) {
      filter.type = type;
    }

    const [docs, total] = await Promise.all([
      this.activityModel
        .find(filter)
        .sort(sort || { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.activityModel.countDocuments(filter),
    ]);

    const items = plainToInstance(Job, docs, { excludeExtraneousValues: true });
    return { items, total };
  }

  async findById(id: string): Promise<Job> {
    const doc = await this.activityModel.findById(id).lean();
    if (!doc) {
      throw new Error('Job not found');
    }
    return plainToInstance(Job, doc, { excludeExtraneousValues: true });
  }
}
