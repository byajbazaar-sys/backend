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
