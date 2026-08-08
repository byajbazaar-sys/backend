import { TwilioMessage } from './twilio-message';
import { SendSMSDto } from './send-sms-dto';

export const TWILIO_SERVICE = 'ITwilioService';

export interface ITwilioService {
  sendSMS(dto: SendSMSDto): Promise<TwilioMessage>;

  /**
   * Reply to a message received from Twilio
   * @param originalFrom The original sender's phone number (your Twilio trial number)
   * @param originalTo The original recipient's phone number (your registered number)
   * @param message The message to send as a reply
   */
  replyToMessage(originalFrom: string, originalTo: string, message: string): Promise<TwilioMessage>;
}
