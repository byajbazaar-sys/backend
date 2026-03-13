import { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthOptions, GoogleUserInfo, GoogleTokenResponse, IGoogleOAuthService } from '../../application';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class GoogleOAuthService implements IGoogleOAuthService {
  private readonly client: OAuth2Client;
  constructor(private readonly options: GoogleOAuthOptions, @InjectPinoLogger(GoogleOAuthService.name) private readonly logger: PinoLogger) {
    this.client = new OAuth2Client(
      this.options.clientId,
      this.options.clientSecret,
      this.options.redirectUri || 'postmessage'
    );
    this.logger.info({ options: this.options }, 'GoogleOAuthService constructor');
  }

  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    const { tokens } = await this.client.getToken(code);
    this.client.setCredentials(tokens);
    return tokens as GoogleTokenResponse;
  }

  async verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.options.clientId,
    });
    return ticket.getPayload() as GoogleUserInfo;
  }

  async getUserInfoFromIdToken(idToken: string): Promise<GoogleUserInfo> {
    const payload = await this.verifyIdToken(idToken);

    // Verify that the client ID matches
    if (payload?.aud !== this.options.clientId) {
      throw new Error('Invalid token: Client ID mismatch');
    }

    return payload;
  }
}
