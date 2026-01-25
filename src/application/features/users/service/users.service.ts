import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { User } from '../domain';
import { IUsersRepository, USERS_REPOSITORY } from './i-users.repository';
import { IUsersService } from './i-users.service';
import { Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UsersService implements IUsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @InjectPinoLogger(UsersService.name) private readonly logger: PinoLogger,
  ) {}

  async findOne(id: string): Promise<User> {
    try {
      const user = await this.usersRepo.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, userId: id }, 'Error finding user');
      throw err;
    }
  }

  async findAll(query: any): Promise<Paged<User>> {
    try {
      // TODO: Implement proper filtering and pagination
      // For now, return empty result as the repository doesn't have listUsers method
      this.logger.warn({ query }, 'findAll not fully implemented');
      return toPaged(User, {
        items: [],
        page: query.page || 1,
        perPage: query.limit || 10,
        totalCount: 0,
      });
    } catch (err) {
      this.logger.error({ err, query }, 'Error finding all users');
      throw err;
    }
  }

  async update(id: string, updateData: User): Promise<User> {
    try {
      const existingUser = await this.usersRepo.findById(id);
      if (!existingUser) {
        throw new NotFoundException('User not found');
      }

      const updatedUser = await this.usersRepo.update(id, updateData);
      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      this.logger.info({ userId: id }, 'User updated successfully');
      return updatedUser;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, userId: id }, 'Error updating user');
      throw err;
    }
  }
}
