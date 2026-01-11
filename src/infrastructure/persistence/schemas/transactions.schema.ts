import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Schemas } from './schemas';
import { ETransactionType, ETransactionPaidIn } from '../../../application';
import { Type } from 'class-transformer';

export type TransactionDocument = HydratedDocument<TransactionsSchema>;

@Schema({ timestamps: true, collection: Schemas.TransactionsSchema })
export class TransactionsSchema {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.LoansSchema, required: true })
  loanId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.CustomersSchema, required: true })
  customerId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: ETransactionType })
  transactionType: ETransactionType;

  @Prop({ required: true, enum: ETransactionPaidIn })
  paidIn: ETransactionPaidIn;

  @Prop({ required: true })
  @Type(() => Date)
  paidAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.UsersSchema, required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.DuesSchema, required: false })
  dueId?: MongooseSchema.Types.ObjectId;
}

export const transactionsSchema = SchemaFactory.createForClass(TransactionsSchema);
