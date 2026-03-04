import { SendEmail } from '../domain';

export const EMAIL_SERVICE = 'IEmailService';

export interface IEmailService {
  sendEmail(data: SendEmail): Promise<void>;
}
