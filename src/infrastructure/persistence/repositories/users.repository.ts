import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BCRYPT_SALT_ROUNDS, EUserType } from '@shared-libs';
import { hashSync } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { Repository, In } from 'typeorm';

import { IUsersRepository, User, CreateUserInput, UserUpdatePatch } from '../../../application';
import { defaultTrialEndsAt } from '../../../application/features/payments/utils/trial.util';
import { UserEntity } from '../entities/user.entity';

const DEFAULT_TRIAL_DAYS = Number(process.env.DEFAULT_TRIAL_DAYS ?? 7);

@Injectable()
export class UsersRepository implements IUsersRepository {
  constructor(@InjectRepository(UserEntity) private userRepo: Repository<UserEntity>) {}

  async create(createUserDto: CreateUserInput): Promise<User> {
    const dto = { ...createUserDto };
    if (dto.password) {
      dto.password = hashSync(dto.password, BCRYPT_SALT_ROUNDS);
    }
    if (!dto.trialEndsAt && dto.userType !== EUserType.Admin) {
      dto.trialEndsAt = defaultTrialEndsAt(DEFAULT_TRIAL_DAYS);
    }
    const entity = this.userRepo.create(dto);
    const created = await this.userRepo.save(entity);
    return plainToInstance(User, created, { excludeExtraneousValues: true });
  }

  async findByEmail(email: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) return null;
    return plainToInstance(User, user, { excludeExtraneousValues: true });
  }

  async findByEmailVerificationToken(token: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { emailVerificationToken: token } });
    if (!user) return null;
    return plainToInstance(User, user, { excludeExtraneousValues: true });
  }

  async findByResetPasswordToken(token: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { resetPasswordToken: token } });
    if (!user) return null;
    return plainToInstance(User, user, { excludeExtraneousValues: true });
  }

  async update(id: string, updateDto: UserUpdatePatch): Promise<User> {
    await this.userRepo.update(id, updateDto as Partial<UserEntity>);
    const updated = await this.userRepo.findOne({ where: { id } });
    if (!updated) return null;
    return plainToInstance(User, updated, { excludeExtraneousValues: true });
  }

  async getUsers(ids?: string[]): Promise<User[]> {
    const where = ids?.length ? { id: In(ids) } : {};
    const users = await this.userRepo.find({ where });
    return plainToInstance(User, users, { excludeExtraneousValues: true });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) return null;
    return plainToInstance(User, user, { excludeExtraneousValues: true });
  }

  async findByGoogleId(googleId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { googleId } });
    if (!user) return null;
    return plainToInstance(User, user, { excludeExtraneousValues: true });
  }

  async findByCatalogSlug(catalogSlug: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { catalogSlug } });
    if (!user) return null;
    return plainToInstance(User, user, { excludeExtraneousValues: true });
  }

  async existsCatalogSlug(catalogSlug: string, excludeUserId?: string): Promise<boolean> {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .where('user.catalog_slug = :catalogSlug', { catalogSlug });
    if (excludeUserId) {
      qb.andWhere('user.id != :excludeUserId', { excludeUserId });
    }
    const count = await qb.getCount();
    return count > 0;
  }

  async softDelete(id: string): Promise<void> {
    await this.userRepo.softDelete(id);
  }
}
