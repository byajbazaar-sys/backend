import { GoogleSsoRequestModel } from '../../features/auth/models';

export const APP_INTEGRITY_SERVICE = 'IAppIntegrityService';

export interface AppIntegrityChallengeResult {
  challenge: string;
  expiresInSeconds: number;
}

export interface IAppIntegrityService {
  createChallenge(): Promise<AppIntegrityChallengeResult>;
  verifyMobileGoogleSso(request: GoogleSsoRequestModel): Promise<void>;
}
