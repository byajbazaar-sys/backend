import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { hashSync } from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared-libs';
import { UserEntity } from '../entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { IUsersRepository, User } from '../../../application';

@Injectable()
export class UsersRepository implements IUsersRepository {
  constructor(@InjectRepository(UserEntity) private userRepo: Repository<UserEntity>) {}

  async create(createUserDto: Partial<User>): Promise<User> {
    const dto = { ...createUserDto };
    if (dto.password) {
      dto.password = hashSync(dto.password, BCRYPT_SALT_ROUNDS);
    }
    console.log(dto);
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

  async update(id: string, updateDto: Partial<User>): Promise<User> {
    await this.userRepo.update(id, updateDto as Partial<UserEntity>);
    const updated = await this.userRepo.findOne({ where: { id } });
    if (!updated) return null;
    return plainToInstance(User, updated, { excludeExtraneousValues: true });
  }

  async getUsers(ids?: string[]): Promise<User[]> {
    const where = ids?.length ? { id: In(ids as string[]) } : {};
    const users = await this.userRepo.find({ where });
    return plainToInstance(User, users, { excludeExtraneousValues: true });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) return null;
    return plainToInstance(User, user, { excludeExtraneousValues: true });
  }
}
