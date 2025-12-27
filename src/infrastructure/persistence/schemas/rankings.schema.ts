import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { HydratedDocument } from 'mongoose';
import { Schemas } from './schemas';

export type RankingDocument = HydratedDocument<RankingsSchema>;

@Schema({ timestamps: true, collection: Schemas.RankingsSchema })

export class RankingsSchema {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.JobApplicationsSchema, required: true })
  jobApplicationId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ required: true })
  feedback: string;

  @Prop({ type: [String], default: [] })
  strengths: string[];

  @Prop({ type: [String], default: [] })
  areasForImprovement: string[];

  @Prop({ type: Object })
  details?: Record<string, any>;
}

export const rankingsSchema = SchemaFactory.createForClass(RankingsSchema);

// Create compound index for faster lookups
rankingsSchema.index({ jobApplicationId: 1 }, { unique: true });
