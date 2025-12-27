import { SetMetadata } from '@nestjs/common';

import { EUserType } from '../interfaces';

export const ROLE_KEY = 'role';
export const Role = (role: EUserType): ReturnType<typeof SetMetadata> => SetMetadata(ROLE_KEY, role);
