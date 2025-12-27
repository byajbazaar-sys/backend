import { Job, JobApplication } from '../domains';

export const JOB_SERVICE = 'IJobService';

export interface IJobService {
  createJob(job: Job): Promise<Job>;
  createJobApplication(jobApplication: JobApplication): Promise<void>;
  updateJobApplicationAnswers(id: string, answers: string[]): Promise<JobApplication>;
  getJobs(params: {
    pageNumber?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    search?: string;
    type?: string;
  }): Promise<{ items: Job[]; total: number; pageNumber: number; pageSize: number }>;
  getJobApplications(params: {
    pageNumber?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    jobId?: string;
  }): Promise<{ items: JobApplication[]; total: number; pageNumber: number; pageSize: number }>;
  getJobApplicationById(id: string): Promise<JobApplication | null>;
}
