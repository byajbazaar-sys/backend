import {
  Controller,
  Post,
  Body,
  HttpStatus,
  UseGuards,
  HttpCode,
  Inject,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Get,
  Query,
  Patch,
  Param,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiQuery,
  getSchemaPath,
  ApiExtraModels,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import {
  JobRequestModel,
  JobResponseModel,
  CreateJobApplicationRequestModel,
  UpdateJobApplicationAnswersRequest,
} from './models';
import { RolesGuard, USER_STRATEGY, IIdentity, Identity, validateObjectIds } from '@shared-libs';
import { JOB_SERVICE, IJobService } from './services';
import { Job, JobApplication } from './domains';
import { plainToInstance } from 'class-transformer';
import { JobApplicationResponseModel } from './models/job-application-response.model';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(@Inject(JOB_SERVICE) private readonly jobService: IJobService) {}

  @Patch('applications/:id/answers')
  @ApiOperation({ summary: 'Update answers for a job application' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The job application answers have been successfully updated.',
    type: JobApplication,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or job application not found',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Job application not found',
  })
  @ApiParam({ name: 'id', description: 'Job application ID', example: '64f1a2b3c5e7a8d9f0b1c2d3' })
  async updateJobApplicationAnswers(
    @Param() id: string,
    @Body() updateDto: UpdateJobApplicationAnswersRequest,
  ): Promise<JobApplication> {
    try {
      return await this.jobService.updateJobApplicationAnswers(id, updateDto.answers);
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to update job application answers');
    }
  }

  @Get('applications')
  @ApiOperation({ summary: 'Get a list of job applications' })
  @ApiQuery({ name: 'pageNumber', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, type: String, example: 'createdAt' })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'], example: 'desc' })
  @ApiQuery({ name: 'jobId', required: false, type: String, description: 'Filter by job ID' })
  @ApiOkResponse({
    description: 'List of job applications',
    type: JobApplicationResponseModel,
    isArray: true,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request parameters',
  })
  async getJobApplications(
    @Query('pageNumber') pageNumber?: number,
    @Query('pageSize') pageSize?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('jobId') jobId?: string,
  ) {
    try {
      const result = await this.jobService.getJobApplications({
        pageNumber: pageNumber ? Number(pageNumber) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        sortBy,
        sortDir,
        jobId,
      });

      return result;
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to fetch job applications');
    }
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Get a job application by ID' })
  @ApiParam({ name: 'id', description: 'Job Application ID' })
  @ApiOkResponse({
    description: 'The job application',
    type: JobApplicationResponseModel,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Job application not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid job application ID',
  })
  async getJobApplicationById(@Param() params: { id: string }): Promise<JobApplicationResponseModel> {
    try {
      console.log('Getting job application by ID:', params.id);
      const application = await this.jobService.getJobApplicationById(params.id);
      if (!application) {
        throw new NotFoundException('Job application not found');
      }
      return plainToInstance(JobApplicationResponseModel, application, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Invalid job application ID');
    }
  }

  @Post()
  @ApiBearerAuth('user')
  @UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
  @ApiOperation({ summary: 'Create a new job' })
  @ApiBody({ type: JobRequestModel })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The job has been successfully created.',
    type: JobResponseModel,
  })
  @HttpCode(HttpStatus.CREATED)
  async createJob(@Body() body: JobRequestModel, @Identity() identity: IIdentity): Promise<JobResponseModel> {
    const job = plainToInstance(Job, body, {
      excludeExtraneousValues: true,
    });
    job.createdBy = identity.userId;

    const jobResponse = await this.jobService.createJob(job);
    return plainToInstance(
      JobResponseModel,
      { job: jobResponse },
      {
        excludeExtraneousValues: true,
      },
    );
  }

  @Post('application')
  @ApiOperation({ summary: 'Apply for a job' })
  @ApiBody({ type: CreateJobApplicationRequestModel })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('resume'))
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The job application has been successfully created.',
    type: String,
  })
  @HttpCode(HttpStatus.CREATED)
  async applyForJob(
    @Body() body: CreateJobApplicationRequestModel,
    @UploadedFile() resume: Express.Multer.File,
  ): Promise<string> {
    const jobApplication = plainToInstance(JobApplication, body, {
      excludeExtraneousValues: true,
    });

    // Convert the uploaded file to buffer and store it
    jobApplication.resume = resume?.buffer;
    jobApplication.resumeFileName = resume.originalname;
    jobApplication.resumeContentType = resume.mimetype;

    await this.jobService.createJobApplication(jobApplication);
    return 'Job application created successfully';
  }

  @Get()
  @ApiOperation({ summary: 'List jobs with pagination, sorting, and search' })
  @ApiQuery({ name: 'pageNumber', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Field to sort by (e.g., createdAt, name)' })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search in name/text' })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'Filter by job type' })
  @ApiOkResponse({
    description: 'Paginated jobs list',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: getSchemaPath(JobResponseModel) },
        },
        total: { type: 'number' },
        pageNumber: { type: 'number' },
        pageSize: { type: 'number' },
      },
    },
  })
  async getJobs(
    @Query('pageNumber') pageNumber?: number,
    @Query('pageSize') pageSize?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('search') search?: string,
    @Query('type') type?: string,
  ): Promise<{ items: JobResponseModel[]; total: number; pageNumber: number; pageSize: number }> {
    const result = await this.jobService.getJobs({ pageNumber, pageSize, sortBy, sortDir, search, type });
    const items = result.items.map((j) =>
      plainToInstance(JobResponseModel, j, {
        excludeExtraneousValues: true,
      }),
    );
    return { items, total: result.total, pageNumber: result.pageNumber, pageSize: result.pageSize };
  }
}
