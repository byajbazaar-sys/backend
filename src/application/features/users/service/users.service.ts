import { Inject } from '@nestjs/common';
import { User } from '../domain';
import { IUsersRepository, USERS_REPOSITORY } from './i-users.repository';
import { IUsersService } from './i-users.service';

export class UsersService implements IUsersService {
  constructor(@Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository) {}

  async findOne(id: string): Promise<User> {
    return this.usersRepo.findById(id);
  }
}
