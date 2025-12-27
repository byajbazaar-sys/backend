import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class UpdateJobApplicationAnswersRequest {
  @ApiProperty({
    description: 'Array of answers to the job application questions',
    type: [String],
    example: ['Answer 1', 'Answer 2', 'Answer 3'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  answers: string[];
}
