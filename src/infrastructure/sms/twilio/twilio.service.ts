import { Injectable } from '@nestjs/common';
import twilio from 'twilio';
import { TwilioOptions } from './twilio.options';
import { SendSMSDto, TwilioMessage, ITwilioService } from '../../../application';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class TwilioService implements ITwilioService {
  private readonly twilioClient: twilio.Twilio;

  constructor(
    protected readonly options: TwilioOptions,
    @InjectPinoLogger(TwilioService.name) private readonly logger: PinoLogger,
  ) {
    this.twilioClient = twilio(this.options.accountSid, this.options.authToken);
  }

  /**
   * Send SMS to a phone number
   */
  async sendSMS(dto: SendSMSDto): Promise<TwilioMessage> {
    try {
      const message = await this.twilioClient.messages.create({
        body: dto.message,
        from: dto.from || this.options.phoneNumber,
        to: dto.to,
      });

      return message;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Reply to a message received from Twilio
   * @param originalFrom The original sender's phone number (your Twilio trial number)
   * @param originalTo The original recipient's phone number (your registered number)
   * @param message The message to send as a reply
   */
  async replyToMessage(originalFrom: string, originalTo: string, message: string): Promise<TwilioMessage> {
    try {
      // When replying, we swap the 'from' and 'to' numbers
      return this.sendSMS({
        to: originalFrom,
        from: originalTo,
        message: message,
      });
    } catch (error) {
      this.logger.error({ err: error, to: originalFrom, from: originalTo }, 'Error sending SMS reply');
      throw error;
    }
  }

  // /**
  //  * Send bulk SMS to multiple phone numbers
  //  */
  // async sendBulkSMS(
  //   phoneNumbers: string[],
  //   message: string,
  // ): Promise<Array<{ to: string; sid: string; status: string }>> {
  //   const results = [];

  //   for (const phoneNumber of phoneNumbers) {
  //     try {
  //       const msg = await this.sendSMS({ to: phoneNumber, message });
  //       results.push({
  //         to: phoneNumber,
  //         sid: msg.sid,
  //         status: 'sent',
  //       });
  //     } catch (error) {
  //       this.logger.error(`Failed to send SMS to ${phoneNumber}:`, error);
  //       results.push({
  //         to: phoneNumber,
  //         sid: null,
  //         status: 'failed',
  //       });
  //     }
  //   }

  //   return results;
  // }

  // /**
  //  * Validate Twilio webhook signature for security
  //  */
  // validateWebhookSignature(signature: string, url: string, params: Record<string, any>): boolean {
  //   return twilio.validateRequest(this.authToken, signature, url, params);
  // }

  // /**
  //  * Generate TwiML response for replying to incoming SMS
  //  */
  // generateTwiMLResponse(message: string): string {
  //   const twiml = new twilio.twiml.MessagingResponse();
  //   twiml.message(message);
  //   return twiml.toString();
  // }

  // /**
  //  * Get message status
  //  */
  // async getMessageStatus(messageSid: string): Promise<string> {
  //   try {
  //     const message = await this.twilioClient.messages(messageSid).fetch();
  //     return message.status;
  //   } catch (error) {
  //     this.logger.error(`Failed to fetch message status for ${messageSid}:`, error);
  //     throw error;
  //   }
  // }

  // /**
  //  * Get message details
  //  */
  // async getMessageDetails(messageSid: string): Promise<TwilioMessage> {
  //   try {
  //     return await this.twilioClient.messages(messageSid).fetch();
  //   } catch (error) {
  //     this.logger.error(`Failed to fetch message details for ${messageSid}:`, error);
  //     throw error;
  //   }
  // }
}
