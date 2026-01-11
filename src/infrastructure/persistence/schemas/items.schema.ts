import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Schemas } from './schemas';

export type ItemDocument = HydratedDocument<ItemsSchema>;

@Schema({ timestamps: true, collection: Schemas.ItemsSchema })
export class ItemsSchema {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.UsersSchema, required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  description?: string;
}

export const itemsSchema = SchemaFactory.createForClass(ItemsSchema);
