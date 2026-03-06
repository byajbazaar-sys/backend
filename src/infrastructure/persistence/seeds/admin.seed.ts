import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { SeedEntity } from '../entities/seed.entity';
import { ESeedType, EUserType } from '@shared-libs';
import { BaseSeed } from './base.seed';
import { hashSync } from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared-libs';

@Injectable()
export class AdminSeed extends BaseSeed {
  protected readonly logger = new Logger(AdminSeed.name);
  protected readonly name = ESeedType.Admin;
  private readonly VERSION = 1;

  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(SeedEntity) seedRepo: Repository<SeedEntity>,
  ) {
    super(seedRepo);
  }

  protected get version(): number {
    return this.VERSION;
  }

  protected async seed(): Promise<void> {
    const adminEmail = 'admin@crowdsay.com';
    const adminExists = await this.userRepo.findOne({ where: { email: adminEmail } });

    if (adminExists) {
      this.logger.log(`Admin user with email ${adminEmail} already exists`);
      return;
    }

    await this.userRepo.save({
      email: adminEmail,
      password: hashSync('Admin@123', BCRYPT_SALT_ROUNDS),
      firstName: 'Admin',
      lastName: 'User',
      userType: EUserType.Admin,
      isEmailVerified: true,
    });

    this.logger.log('Admin user created successfully');
  }
}
