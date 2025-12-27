import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { HEADER, USER_STRATEGY } from '../../constants';
import { IIdentity } from '../interfaces';
import { UsersAuthOptions } from '../options';

@Injectable()
export class UserJwtStrategy extends PassportStrategy(Strategy, USER_STRATEGY) {
  constructor(options: UsersAuthOptions) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(), // standard Bearer
        ExtractJwt.fromHeader(HEADER.toLowerCase()), // raw header value fallback
        ExtractJwt.fromUrlQueryParameter(options.queryParamName), // ?users_token=...
      ]),
      audience: options.audience,
      issuer: options.issuer,
      algorithms: [options.algorithm],
      secretOrKey: options.secret,
    });
  }

  public validate(payload: IIdentity): IIdentity {
    console.log(payload);
    return payload;
  }
}
