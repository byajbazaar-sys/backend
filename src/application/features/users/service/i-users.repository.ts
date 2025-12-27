import { Types } from 'mongoose';
import { User } from '../domain';

export const USERS_REPOSITORY = 'USERS_REPOSITORY';

export interface IUsersRepository {
  create(createUserDto: Partial<User>): Promise<User>;
  findByEmail(email: string): Promise<User>;
  update(id: string, updateDto: Partial<User>): Promise<User>;
  findByEmailVerificationToken(token: string): Promise<User>;
  findById(id: string): Promise<User>;
}
