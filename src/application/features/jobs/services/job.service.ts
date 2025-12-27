import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IJobService } from './i-job.service';
import { InjectPinoLogger } from 'nestjs-pino';
import { PinoLogger } from 'nestjs-pino';
import { USERS_REPOSITORY, IUsersRepository } from '../../users';
import { IJobRepository, JOB_APPLICATION_REPOSITORY } from '../repositories';
import { Job, JobApplication } from '../domains';
import { JOB_REPOSITORY } from '../repositories';
import { IJobApplicationRepository } from '../repositories';
import {
  IJobsFileStorage,
  JOBS_FILE_STORAGE,
  LAMBDA_SERVICE,
  ILambdaService,
  AI_RESUME_SERVICE,
  IAIResumeService,
  TWILIO_SERVICE,
  ITwilioService,
} from '../../../shared';
import { ConfigService } from '@nestjs/config';
import { IMsConfig } from 'src/configurations';
import { RANKING_REPOSITORY, IRankingRepository } from '../repositories';
import { Types } from 'mongoose';

export class JobService implements IJobService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly userRepository: IUsersRepository,
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(JOB_APPLICATION_REPOSITORY) private readonly jobApplicationRepository: IJobApplicationRepository,
    @Inject(JOBS_FILE_STORAGE) private readonly jobsFileStorage: IJobsFileStorage,
    @Inject(LAMBDA_SERVICE) private readonly lambdaService: ILambdaService,
    @Inject(AI_RESUME_SERVICE) private readonly aiService: IAIResumeService,
    @Inject(TWILIO_SERVICE) private readonly twilioService: ITwilioService,
    @Inject(ConfigService) private readonly configService: ConfigService<IMsConfig>,
    @Inject(RANKING_REPOSITORY) private readonly rankingRepository: IRankingRepository,
    @InjectPinoLogger() private readonly logger: PinoLogger,
  ) {}

  async createJob(job: Job): Promise<Job> {
    try {
      const user = await this.userRepository.findById(job.createdBy);
      if (!user) {
        throw new BadRequestException('User not found');
      }

      return await this.jobRepository.createJob(job);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getJobs(params: {
    pageNumber?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    search?: string;
    type?: string;
  }): Promise<{ items: Job[]; total: number; pageNumber: number; pageSize: number }> {
    try {
      const pageNumber = params?.pageNumber && params.pageNumber > 0 ? params.pageNumber : 1;
      const pageSize = params?.pageSize && params.pageSize > 0 ? params.pageSize : 10;
      const skip = (pageNumber - 1) * pageSize;

      const sort: Record<string, 1 | -1> | undefined = params?.sortBy
        ? { [params.sortBy]: params?.sortDir === 'asc' ? 1 : -1 }
        : { createdAt: -1 };

      const { items, total } = await this.jobRepository.listJobs({
        skip,
        limit: pageSize,
        sort,
        search: params?.search,
        type: params?.type,
      });

      return { items, total, pageNumber, pageSize };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async createJobApplication(jobApplication: JobApplication): Promise<void> {
    try {
      const job = await this.jobRepository.findById(jobApplication.jobId);
      if (!job) {
        throw new BadRequestException('Job not found');
      }

      this.processApplication(jobApplication);
      return;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  private async processApplication(jobApplication: JobApplication) {
    console.log("Job Application: =============")
    console.log(jobApplication);
    const id = new Types.ObjectId().toString();
    const path = `resume/${jobApplication.jobId}/${id}`;
    await this.jobsFileStorage.writeAsync(path, jobApplication.resume);

    const lambdaPayload = {
      bucket: 'jobs-file-storage',
      key: jobApplication.resumeFileName.includes(".pdf")?`${path}.pdf`:path+".docx",
      output_bucket: 'jobs-file-storage',
      include_raw_text: true,
      include_images: true,
      upload_to_s3: false,
    };
    const details = await this.lambdaService.invokeLambda('resume-parser-image', lambdaPayload);
    console.log("Details: =============")
    console.log(details);
    const aiServiceResult = await this.aiService.analyzeResumeWithAI(
      typeof details.body === 'string' ? JSON.parse(details.body) : details.body,
      'gemini',
    );
    console.log(aiServiceResult);

    jobApplication.questions = aiServiceResult.interviewQuestions;
    jobApplication.documentId = path;
    console.log('Candidate Profile:', aiServiceResult.candidateProfile);
    jobApplication.name = aiServiceResult.candidateProfile.fullName;
    jobApplication.email = aiServiceResult.candidateProfile.email;
    jobApplication.phone = aiServiceResult.candidateProfile.phone;
    jobApplication.skills = aiServiceResult.candidateProfile.skills;

    const jobApplicationResult = await this.jobApplicationRepository.createJobApplication(jobApplication);
    console.log(this.configService.get('webAppDomain') + '/assessment/' + jobApplicationResult.id);
    // this.twilioService.sendSMS({
    //   to: aiServiceResult.candidateProfile.phone,
    //   message: `Hi ${aiServiceResult.candidateProfile.fullName.toLowerCase().trim()} start your text interview using the following link: ${this.configService.get('webAppDomain')}/assessment/${jobApplicationResult.id}`,
    // });
    // const profileImagePath = `profiles/${id}.jpg`;
    // this.jobsFileStorage.writeAsync(
    //   profileImagePath,
    //   Buffer.from(aiServiceResult?.photoAnalysis?.bestPhoto?.base64, 'base64'),
    // );
  }

  async updateJobApplicationAnswers(id: string, answers: string[]): Promise<JobApplication> {
    try {
      if (!id) {
        throw new BadRequestException('Job application ID is required');
      }

      if (!Array.isArray(answers)) {
        throw new BadRequestException('Answers must be an array of strings');
      }

      const application = await this.jobApplicationRepository.getJobApplicationById(id);
      if (!application) {
        throw new NotFoundException('Job application not found');
      }

      if (application.answers && application.answers.length) {
        throw new BadRequestException('Job application has already been submitted');
      }

      const updatedApplication = await this.jobApplicationRepository.updateJobApplicationAnswers(id, answers);
      const data = await this.aiService.calculateRankingScore(updatedApplication.questions, updatedApplication.answers);

      // Save the ranking
      if (data && data.score !== undefined) {
        await this.rankingRepository.createOrUpdateRanking(
          id,
          data.score,
          data.feedback || '',
          data.strengths || [],
          data.areasForImprovement || [],
        );
      }

      console.log(data);
      if (!updatedApplication) {
        throw new BadRequestException('Job application not found');
      }

      return updatedApplication;
    } catch (error) {
      this.logger.error(`Error updating job application answers: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getJobApplications(params: {
    pageNumber?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    jobId?: string;
  }): Promise<{ items: JobApplication[]; total: number; pageNumber: number; pageSize: number }> {
    try {
      const res = await this.jobApplicationRepository.getJobApplications({
        pageNumber: params.pageNumber,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortDir: params.sortDir,
        jobId: params.jobId,
      });

      console.log('getJobApplications result:', res);
      return res;
    } catch (error) {
      this.logger.error(`Error getting job applications: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to get job applications');
    }
  }

  async getJobApplicationById(id: string): Promise<JobApplication> {
    try {
      if (!id) {
        throw new BadRequestException('Job application ID is required');
      }

      const application = await this.jobApplicationRepository.getJobApplicationById(id);
      if (!application) {
        throw new NotFoundException('Job application not found');
      }
      const ranking = await this.rankingRepository.getRankingByJobApplicationId(id);
      application.ranking = ranking;
      try {
        // const imageBuffer = await this.jobsFileStorage.readAsync(`profiles/${id}.jpg`);
        // application.image = imageBuffer.toString('base64');
      } catch (imageError) {
        this.logger.warn(`Profile image not found for application ${id}: ${imageError.message}`);
        application.image = null;
      }
      console.log('Application with ranking:', application);
      return application;
    } catch (error) {
      this.logger.error(`Error getting job application by ID: ${error.message}`, error.stack);
      throw error instanceof BadRequestException || error instanceof NotFoundException
        ? error
        : new BadRequestException('Failed to get job application');
    }
  }
}
