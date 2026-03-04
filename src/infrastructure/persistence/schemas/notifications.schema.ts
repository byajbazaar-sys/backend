import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Schemas } from './schemas';

@Schema({ timestamps: true, collection: Schemas.NotificationsSchema })
export class NotificationsSchema {
  @Prop({ required: true, enum: ['email', 'sms'] })
  channel: string;

  @Prop({ required: true })
  recipient: string;

  @Prop()
  subject?: string;

  @Prop({ required: true })
  body: string;

  @Prop({ required: true, enum: ['pending', 'sent', 'failed'] })
  status: string;

  @Prop()
  externalId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  @Prop()
  errorMessage?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Schemas.UsersSchema })
  createdBy?: Types.ObjectId;
}

export const notificationsSchema = SchemaFactory.createForClass(NotificationsSchema);
export type NotificationDocument = HydratedDocument<NotificationsSchema>;
