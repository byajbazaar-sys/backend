import { JobApplication } from '../domains';

export const JOB_APPLICATION_REPOSITORY = 'IJobApplicationRepository';

export interface IJobApplicationRepository {
  createJobApplication(jobApplication: JobApplication): Promise<JobApplication>;
  updateJobApplicationAnswers(id: string, answers: string[]): Promise<JobApplication | null>;
  getJobApplications(params: {
    pageNumber?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    jobId?: string;
  }): Promise<{ items: JobApplication[]; total: number; pageNumber: number; pageSize: number }>;
  getJobApplicationById(id: string): Promise<JobApplication | null>;
}
