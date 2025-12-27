import { Injectable } from '@nestjs/common';
import { Algorithm } from 'jsonwebtoken';

import { AUDIENCE, ISSUER, ALG } from '../../constants';

const TOKEN_QUERY_NAME = 'users_token';

@Injectable()
export class UsersAuthOptions {
  public secret: string;
  public audience: string;
  public issuer: string;
  public algorithm: Algorithm;
  public queryParamName: string;

  constructor(
    secret: string,
    audience: string = AUDIENCE,
    issuer: string = ISSUER,
    algorithm: Algorithm = ALG,
    queryParamName: string = TOKEN_QUERY_NAME,
  ) {
    this.secret = secret;
    this.audience = audience;
    this.issuer = issuer;
    this.algorithm = algorithm;
    this.queryParamName = queryParamName;
  }
}
