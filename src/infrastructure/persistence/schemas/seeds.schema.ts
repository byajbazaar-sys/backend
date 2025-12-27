import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ESeedType } from '@shared-libs';
import { HydratedDocument } from 'mongoose';
import { Schemas } from './schemas';

@Schema({
  collection: Schemas.SeedsSchema,
  timestamps: true,
})
export class SeedsSchema {
  @Prop({ required: true, enum: ESeedType, unique: true })
  name: string;

  @Prop({ required: true, default: 0 })
  version: number;

  @Prop({ required: true, default: Date.now })
  timestamp: Date;

  @Prop()
  description?: string;
}

export const seedsSchema = SchemaFactory.createForClass(SeedsSchema);

export type SeedsDocument = HydratedDocument<SeedsSchema>;
