import { User } from '../domain';
import { Paged } from '@shared-libs';

export const USERS_SERVICE = 'USERS_SERVICE';

export interface IUsersService {
  findOne(id: string): Promise<User>;
  findAll(query: any): Promise<Paged<User>>;
  update(id: string, updateData: User): Promise<User>;
  remove(id: string): Promise<void>;
}