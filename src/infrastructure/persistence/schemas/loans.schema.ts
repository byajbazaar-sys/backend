import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Schemas } from './schemas';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType } from '../../../application/features/loans/enums';

export type LoanDocument = HydratedDocument<LoansSchema>;

@Schema({ timestamps: true, collection: Schemas.LoansSchema })
export class LoansSchema {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.UsersSchema, required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.CustomersSchema, required: true })
  customerId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, enum: ELoanTenureType })
  tenureType: ELoanTenureType;

  @Prop({ required: true })
  tenureValue: number;

  @Prop({ required: true, enum: EInterestCalculationMethod })
  interestCalculationMethod: EInterestCalculationMethod;

  @Prop({ required: true })
  interestPercentage: number;

  @Prop({ required: true, enum: EInterestType })
  interestType: EInterestType;
}

export const loansSchema = SchemaFactory.createForClass(LoansSchema);
