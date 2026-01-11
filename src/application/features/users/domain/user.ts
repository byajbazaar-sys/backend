import { EUserType } from '@shared-libs';
import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';

export class User {
  @Expose()
  public _id?: Types.ObjectId;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
  public id?: string;

  @Expose()
  public firstName?: string;

  @Expose()
  public lastName?: string;

  @Expose()
  public email?: string;

  @Expose()
  public password?: string;

  @Expose()
  public phoneNumber?: string;

  @Expose()
  public userType?: EUserType;

  @Expose()
  public isEmailVerified?: boolean;

  @Expose()
  public emailVerifiedAt?: Date;

  @Expose()
  public passwordChangedAt?: Date;

  @Expose()
  public resetPasswordToken?: string;

  @Expose()
  public resetPasswordExpires?: Date;

  @Expose()
  public emailVerificationToken?: string;

  @Expose()
  public emailVerificationExpires?: Date;

  @Expose()
  public createdAt?: Date;

  @Expose()
  public updatedAt?: Date;

  @Expose()
  public profilePhotoRef?: string;

  @Expose()
  @Type(() => Buffer)
  public profilePhoto: Buffer;

  @Expose()
  public profilePhotoFileName: string;

  @Expose()
  public profilePhotoContentType: string;
}
