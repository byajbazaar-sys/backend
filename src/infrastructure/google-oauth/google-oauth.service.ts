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
      this.options.redirectUri
    );
    this.logger.info({ options: this.options }, 'GoogleOAuthService constructor');
  }

  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    if (!this.options.redirectUri) {
      throw new Error('Redirect URI is not configured');
    }

    try {
      this.logger.debug({ redirectUri: this.options.redirectUri }, 'Attempting token exchange with redirectUri');
      
      const client = new OAuth2Client(
        this.options.clientId,
        this.options.clientSecret,
        this.options.redirectUri
      );
      
      const { tokens } = await client.getToken({
        code,
        redirect_uri: this.options.redirectUri,
      });
      
      client.setCredentials(tokens);
      this.logger.info({ redirectUri: this.options.redirectUri }, 'Successfully exchanged authorization code');
      return tokens as GoogleTokenResponse;
    } catch (error: any) {
      const errorData = error?.response?.data || {};
      this.logger.error({
        redirectUri: this.options.redirectUri,
        error: error?.message,
        details: errorData,
      }, 'Token exchange failed');
      throw error;
    }
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
