import { AppIntegrityChallengeResult } from './app-integrity-challenge-result';
import { GoogleSsoRequestModel } from '../../features';

export const APP_INTEGRITY_SERVICE = 'IAppIntegrityService';

export interface IAppIntegrityService {
  createChallenge(): Promise<AppIntegrityChallengeResult>;
  verifyMobileGoogleSso(request: GoogleSsoRequestModel): Promise<void>;
}
