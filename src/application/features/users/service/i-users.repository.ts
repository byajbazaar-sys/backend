import { User } from '../domain';
import { CreateUserInput, UserUpdatePatch } from '../models';

export const USERS_REPOSITORY = 'USERS_REPOSITORY';

export interface IUsersRepository {
  create(createUserDto: CreateUserInput): Promise<User>;
  findByEmail(email: string): Promise<User>;
  update(id: string, updateDto: UserUpdatePatch): Promise<User>;
  findByEmailVerificationToken(token: string): Promise<User>;
  findByResetPasswordToken(token: string): Promise<User>;
  findById(id: string): Promise<User>;
  findByGoogleId(googleId: string): Promise<User>;
  findByCatalogSlug(catalogSlug: string): Promise<User>;
  existsCatalogSlug(catalogSlug: string, excludeUserId?: string): Promise<boolean>;
  softDelete(id: string): Promise<void>;
}
