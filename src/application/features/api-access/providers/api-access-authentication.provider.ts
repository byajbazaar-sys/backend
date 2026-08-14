import { Inject, Injectable } from '@nestjs/common';
import { extractRequestToken, IAuthenticationProvider, IIdentity, UsersAuthOptions } from '@shared-libs';
import { Request } from 'express';

import { API_AUTH_SERVICE, IApiAuthService } from '../service';

@Injectable()
export class ApiAccessAuthenticationProvider implements IAuthenticationProvider {
  constructor(
    private readonly options: UsersAuthOptions,
    @Inject(API_AUTH_SERVICE) private readonly apiAuthService: IApiAuthService,
  ) {}

  async authenticate(request: Request): Promise<IIdentity> {
    const token = extractRequestToken(request, this.options.queryParamName);
    if (!token || token.startsWith('eyJ')) {
      return null;
    }

    try {
      return await this.apiAuthService.validateAccessToken(token);
    } catch {
      return null;
    }
  }
}
