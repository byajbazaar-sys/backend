import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Schemas } from './schemas';
import { ELoanItemType } from '../../../application/features/loans/enums';

export type LoanItemDocument = HydratedDocument<LoanItemsSchema>;

@Schema({ timestamps: true, collection: Schemas.LoanItemsSchema })
export class LoanItemsSchema {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.LoansSchema, required: true })
  loanId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.UsersSchema, required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, enum: ELoanItemType })
  type: ELoanItemType;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  itemName: string;

  @Prop({ required: false })
  itemDescription?: string;

  @Prop({ required: true })
  netWeightInGrams: number;

  @Prop({ required: true })
  grossWeightInGrams: number;

  @Prop({ required: false })
  imageRef?: string;
}

export const loanItemsSchema = SchemaFactory.createForClass(LoanItemsSchema);
