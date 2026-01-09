import { User } from "../domain";

export const USERS_SERVICE = 'USERS_SERVICE';

export interface IUsersService {
  findOne(id: string): Promise<User>;
}