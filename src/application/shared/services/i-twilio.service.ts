export interface TwilioMessage {
  sid: string;
  body: string;
  from: string;
  to: string;
  status: string;
  dateCreated: Date;
  dateUpdated: Date;
  dateSent?: Date;
  accountSid: string;
  numMedia: string;
  numSegments: string;
  price?: string;
  priceUnit?: string;
  apiVersion: string;
  uri: string;
}

export interface SendSMSDto {
  to: string;
  message: string;
  from?: string;
}

export interface TwilioWebhookPayload {
  MessageSid: string;
  SmsSid: string;
  AccountSid: string;
  MessagingServiceSid?: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  NumSegments: string;
  SmsStatus: string;
  ApiVersion: string;
  [key: string]: any;
}

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
