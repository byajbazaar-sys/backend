import { IFileStorage, IFileUrlResolver } from '@shared-libs';

export const USERS_FILE_STORAGE = 'IUsersFileStorage';

export interface IUsersFileStorage extends IFileStorage, IFileUrlResolver {}
