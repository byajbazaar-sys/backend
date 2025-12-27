import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateJobApplicationRequestModel {
  @Expose()
  @ApiProperty({
    type: 'string',
    format: 'string',
    required: true,
    description: 'Job ID (MongoDB ObjectId)',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @Matches(/^[a-f\d]{24}$/i, { message: 'jobId must be a valid ObjectId' })
  jobId: string;

  @Expose()
  @ApiProperty({
    type: 'string',
    format: 'binary',
    required: true,
    description: 'Resume file upload',
  })
  resume: Express.Multer.File;
}
