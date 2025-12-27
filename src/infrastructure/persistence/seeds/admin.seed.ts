// In admin.seed.ts
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersSchema, UserDocument } from '../schemas/users.schema';
import { ESeedType, EUserType } from '@shared-libs';
import { BaseSeed } from './base.seed';
import { SeedsSchema, SeedsDocument } from '../schemas/seeds.schema';

export class AdminSeed extends BaseSeed {
  protected readonly logger = new Logger(AdminSeed.name);
  protected readonly name = ESeedType.Admin;
  private readonly VERSION = 1; // Version constant for this seeder

  constructor(
    @InjectModel(UsersSchema.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SeedsSchema.name) seedVersionModel: Model<SeedsDocument>,
  ) {
    super(seedVersionModel);
  }

  // Dynamic version getter
  protected get version(): number {
    return this.VERSION;
  }

  protected async seed(): Promise<void> {
    const adminEmail = 'admin@crowdsay.com';
    const adminExists = await this.userModel.findOne({ email: adminEmail }).exec();
    
    if (adminExists) {
      this.logger.log(`Admin user with email ${adminEmail} already exists`);
      return;
    }

    await this.userModel.create({
      email: adminEmail,
      password: 'Admin@123', // This will be hashed by the pre-save hook
      firstName: 'Admin',
      lastName: 'User',
      userType: EUserType.Admin,
      isEmailVerified: true,
    });

    this.logger.log('Admin user created successfully');
  }
}