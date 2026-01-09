import { SetMetadata } from '@nestjs/common';

import { EUserType } from '../interfaces';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: EUserType[]): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, roles);
