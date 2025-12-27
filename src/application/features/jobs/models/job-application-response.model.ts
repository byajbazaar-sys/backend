import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { RankingResponseModel } from './ranking-response.model';

export class JobApplicationResponseModel {
  @ApiProperty({ description: 'Unique identifier for the job application' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'ID of the job this application is for' })
  @Expose()
  jobId: string;

  @ApiProperty({ description: 'ID of the applicant' })
  @Expose()
  applicantId: string;

  @ApiProperty({ description: 'Current status of the application' })
  @Expose()
  status: string;

  @ApiProperty({ description: 'Answers provided in the application' })
  @Expose()
  answers?: Record<string, any>;

  @ApiProperty({ description: 'URL to the uploaded resume' })
  @Expose()
  resumeUrl?: string;

  @ApiProperty({ description: 'Date when the application was created' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Date when the application was last updated' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({ description: 'Questions asked in the application' })
  @Expose()
  questions?: string[];

  @Expose()
  @ApiProperty({ description: 'Ranking information for the application' })
  @Type(() => RankingResponseModel)
  ranking?: RankingResponseModel;

  @ApiProperty({ description: 'Applicant name' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Applicant email' })
  @Expose()
  email: string;

  @ApiProperty({ description: 'Applicant phone' })
  @Expose()
  phone: string;

  @ApiProperty({ description: 'Base64 encoded profile image' })
  @Expose()
  image?: string;

  @ApiProperty({ description: 'Skills of the applicant' })
  @Expose()
  skills?: string[];
}
