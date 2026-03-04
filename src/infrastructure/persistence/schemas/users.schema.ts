import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Schemas } from './schemas';
import { hashSync } from 'bcrypt';
import { BCRYPT_SALT_ROUNDS, EUserType } from '@shared-libs';

export type UserDocument = HydratedDocument<UsersSchema>;

@Schema({
  timestamps: true,
  collection: Schemas.UsersSchema,
})
export class UsersSchema {
  @Prop({ required: false })
  firstName?: string;

  @Prop({ required: false })
  lastName?: string;

  @Prop({ required: true })
  email: string;

  @Prop({ select: true })
  password: string;

  @Prop({ select: true, type: Boolean, default: false })
  isEmailVerified: boolean;

  @Prop({ type: Date, default: null })
  emailVerifiedAt?: Date;

  @Prop({ type: String, default: null })
  resetPasswordToken?: string;

  @Prop({ type: Date, default: null })
  resetPasswordExpires?: Date;

  @Prop({ type: String, default: null })
  emailVerificationToken?: string;

  @Prop({ type: Date, default: null })
  emailVerificationExpires?: Date;

  @Prop({ type: String, enum: EUserType, default: EUserType.User })
  userType: EUserType;

  @Prop({ type: String, default: null })
  profilePhotoRef: string;

  @Prop({ required: false, default: null })
  businessName?: string;

  @Prop({ required: false, default: null })
  address?: string;
}

export const usersSchema = SchemaFactory.createForClass(UsersSchema);
usersSchema.pre('save', async function (next) {
  const user = this;
  if (user.isModified('password')) {
    user.password = hashPassword(user.password);
  }
  next();
});

function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_SALT_ROUNDS);
}

usersSchema.index({ email: 1 }, { unique: true });
