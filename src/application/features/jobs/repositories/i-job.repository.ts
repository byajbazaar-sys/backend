import { Job } from '../domains';

export const JOB_REPOSITORY = 'IJobRepository';

export interface IJobRepository {
  createJob(job: Job): Promise<Job>;
  findById(id: string): Promise<Job>;
  listJobs(params: {
    skip: number;
    limit: number;
    sort?: Record<string, 1 | -1>;
    search?: string;
    type?: string;
  }): Promise<{ items: Job[]; total: number }>;
}
