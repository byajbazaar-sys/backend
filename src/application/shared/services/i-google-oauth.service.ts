import { GoogleUserInfo, GoogleTokenResponse } from '../domain';

export const GOOGLE_OAUTH_SERVICE = 'GOOGLE_OAUTH_SERVICE';

export interface IGoogleOAuthService {
  exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse>;
  verifyIdToken(idToken: string): Promise<GoogleUserInfo>;
  getUserInfoFromIdToken(idToken: string): Promise<GoogleUserInfo>;
}
