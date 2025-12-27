import { Expose, Transform, Type } from 'class-transformer';
import { Ranking } from './rankings';

export class JobApplication {
  @Expose()
  _id: string;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
  id: string;

  @Expose()
  jobId: string;

  @Expose()
  @Type(() => Buffer)
  resume: Buffer;

  @Expose()
  resumeFileName: string;

  @Expose()
  resumeContentType: string;

  @Expose()
  questions: string[];

  @Expose()
  answers: string[];

  @Expose()
  documentId: string;

  @Expose()
  @Type(() => Ranking)
  ranking?: Ranking;

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  phone: string;

  @Expose()
  skills: string[];

  @Expose()
  image: string;
}
