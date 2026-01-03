import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Schemas } from './schemas';

export type CustomerDocument = HydratedDocument<CustomersSchema>;

@Schema({ timestamps: true, collection: Schemas.CustomersSchema })
export class CustomersSchema {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.UsersSchema, required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: false })
  middleName?: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true})
  email: string;

  @Prop({ required: false })
  phone?: string;

  @Prop({ required: false })
  alternativePhone?: string;

  @Prop({ required: false })
  profilePhotoRef?: string;

  @Prop({ required: false })
  aadhaarCardRef?: string;

  @Prop({ required: false })
  panCardRef?: string;

  @Prop({ required: false })
  location?: string;
}

export const customersSchema = SchemaFactory.createForClass(CustomersSchema);