import { User } from '../domain';

export const USERS_REPOSITORY = 'USERS_REPOSITORY';

export interface IUsersRepository {
  create(createUserDto: User): Promise<User>;
  findByEmail(email: string): Promise<User>;
  update(id: string, updateDto: Partial<User>): Promise<User>;
  findByEmailVerificationToken(token: string): Promise<User>;
  findByResetPasswordToken(token: string): Promise<User>;
  findById(id: string): Promise<User>;
  findByGoogleId(googleId: string): Promise<User>;
  softDelete(id: string): Promise<void>;
}
