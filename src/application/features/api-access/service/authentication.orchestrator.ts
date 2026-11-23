import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  IAuthenticationOrchestrator,
  IAuthenticationProvider,
  IIdentity,
  JwtAuthenticationProvider,
} from '@shared-libs';
import { Request } from 'express';

import { ApiAccessAuthenticationProvider } from './api-access-authentication.provider';
import { ShopAccessService } from '../../shops/service/shop-access.service';

@Injectable()
export class AuthenticationOrchestrator implements IAuthenticationOrchestrator {
  private readonly providers: IAuthenticationProvider[];

  constructor(
    jwtProvider: JwtAuthenticationProvider,
    apiAccessProvider: ApiAccessAuthenticationProvider,
    private readonly shopAccess: ShopAccessService,
  ) {
    this.providers = [jwtProvider, apiAccessProvider];
  }

  /** The signed-in person, then the shop they work in (X-Shop-Id) with their access checked. */
  async authenticate(request: Request): Promise<IIdentity> {
    for (const provider of this.providers) {
      const identity = await provider.authenticate(request);
      if (identity) {
        return this.shopAccess.resolve(request, identity);
      }
    }
    throw new UnauthorizedException();
  }
}
