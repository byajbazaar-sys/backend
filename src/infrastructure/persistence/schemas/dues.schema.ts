import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Schemas } from './schemas';
import { EDueType } from '../../../application';
import { Type } from 'class-transformer';

export type DueDocument = HydratedDocument<DuesSchema>;

@Schema({ timestamps: true, collection: Schemas.DuesSchema })
export class DuesSchema {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.LoansSchema, required: true })
  loanId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.CustomersSchema, required: true })
  customerId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  dueAmount: number;

  @Prop({ required: true, enum: EDueType })
  type: EDueType;

  @Prop({ required: true })
  @Type(() => Date)
  dueDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.UsersSchema, required: true })
  createdBy: MongooseSchema.Types.ObjectId;
}

export const duesSchema = SchemaFactory.createForClass(DuesSchema);
  