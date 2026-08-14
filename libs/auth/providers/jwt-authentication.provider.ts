import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { IIdentity } from '../interfaces';
import { UsersAuthOptions } from '../options';
import { IAuthenticationProvider } from './i-authentication-provider';
import { extractRequestToken } from '../utils/extract-request-token.util';

@Injectable()
export class JwtAuthenticationProvider implements IAuthenticationProvider {
  constructor(
    private readonly jwtService: JwtService,
    private readonly options: UsersAuthOptions,
  ) {}

  async authenticate(request: Request): Promise<IIdentity> {
    const token = extractRequestToken(request, this.options.queryParamName);
    if (!token) return null;

    try {
      return this.jwtService.verify<IIdentity>(token, {
        secret: this.options.secret,
        audience: this.options.audience,
        issuer: this.options.issuer,
        algorithms: [this.options.algorithm],
      });
    } catch {
      return null;
    }
  }
}
