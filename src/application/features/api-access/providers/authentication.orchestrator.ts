import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import {
  IAuthenticationOrchestrator,
  IAuthenticationProvider,
  IIdentity,
  JwtAuthenticationProvider,
} from '@shared-libs';
import { ApiAccessAuthenticationProvider } from './api-access-authentication.provider';

@Injectable()
export class AuthenticationOrchestrator implements IAuthenticationOrchestrator {
  private readonly providers: IAuthenticationProvider[];

  constructor(
    jwtProvider: JwtAuthenticationProvider,
    apiAccessProvider: ApiAccessAuthenticationProvider,
  ) {
    this.providers = [jwtProvider, apiAccessProvider];
  }

  async authenticate(request: Request): Promise<IIdentity> {
    for (const provider of this.providers) {
      const identity = await provider.authenticate(request);
      if (identity) {
        return identity;
      }
    }
    throw new UnauthorizedException();
  }
}
