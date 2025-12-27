import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Schemas } from './schemas';

@Schema({
  timestamps: true,
  collection: Schemas.JobApplicationsSchema,
})
export class JobApplicationsSchema {
  @Prop({
    type: Types.ObjectId,
    required: true,
    ref: Schemas.JobsSchema,
  })
  jobId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    required: true,
    ref: Schemas.DocumentsSchema,
  })
  documentId: Types.ObjectId;

  @Prop({
    type: [String],
  })
  questions: string[];

  @Prop({
    type: [String],
  })
  answers: string[];

  @Prop({
    type: String,
  })
  name: string;

  @Prop({
    type: String,
  })
  email: string;

  @Prop({
    type: String,
  })
  phone: string;

  @Prop({
    type: [String],
  })
  skills: string[];
}

export const jobApplicationsSchema = SchemaFactory.createForClass(JobApplicationsSchema);

export type JobApplicationsDocument = HydratedDocument<JobApplicationsSchema>;
