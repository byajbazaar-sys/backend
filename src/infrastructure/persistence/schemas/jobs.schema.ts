import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Schemas } from './schemas';
import { Types } from 'mongoose';

export type JobsDocument = HydratedDocument<JobsSchema>;

@Schema({
  timestamps: true,
  collection: Schemas.JobsSchema,
})
export class JobsSchema {
  @Prop({
    type: String,
    required: true,
    maxlength: 50,
  })
  name: string;

  @Prop({
    type: String,
    required: true,
  })
  type: string;

  @Prop({
    type: Number,
    default: null,
  })
  expiresAt?: number;

  @Prop({
    type: String,
    default: null,
  })
  text?: string;

  @Prop({
    type: Types.ObjectId,
    required: true,
    ref: 'Users',
  })
  createdBy: Types.ObjectId;

  @Prop({
    type: Object,
    default: {},
  })
  custom?: Record<string, any>;

  @Prop({
    type: Number,
    default: 1,
  })
  numberOfOpenings: number;

  @Prop({
    type: String,
    default: 'open',
  })
  status: string;
}

export const jobsSchema = SchemaFactory.createForClass(JobsSchema);
