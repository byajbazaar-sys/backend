import { Injectable } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { IEmailService, SendEmail } from '../../application';
import { SesOptions } from './options';

@Injectable()
export class SesService implements IEmailService {
  private readonly sesClient: SESClient;

  constructor(
    protected readonly options: SesOptions,
    @InjectPinoLogger(SesService.name) protected readonly logger: PinoLogger,
  ) {
    this.sesClient = new SESClient({
      region: this.options.region,
      credentials: {
        accessKeyId: this.options.accessKeyId,
        secretAccessKey: this.options.secretAccessKey,
      },
    });
  }

  async sendEmail(data: SendEmail): Promise<void> {
    const email = plainToInstance(SendEmail, data, { excludeExtraneousValues: true });
    this.logger.debug({ to: email.to }, 'sendEmail called');

    try {
      const toAddresses = this.normalizeRecipients(email.to);
      const fromAddress = email.from?.email ?? this.options.sender;
      const fromName = email.from?.name ?? this.options.senderName ?? this.options.sender;
      const source = fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;

      const command = new SendEmailCommand({
        Source: source,
        Destination: {
          ToAddresses: toAddresses,
        },
        Message: {
          Subject: {
            Data: email.subject,
            Charset: 'UTF-8',
          },
          Body: {
            ...(email.isHtml
              ? {
                  Html: {
                    Data: email.body,
                    Charset: 'UTF-8',
                  },
                }
              : {
                  Text: {
                    Data: email.body,
                    Charset: 'UTF-8',
                  },
                }),
          },
        },
      });

      const response = await this.sesClient.send(command);
      this.logger.info({ messageId: response.MessageId }, 'SES send successful');

      if (email.attachments?.length) {
        this.logger.warn('SES does not support attachments via SendEmailCommand; attachments were ignored');
      }
    } catch (err) {
      this.logger.error({ err, to: email.to }, 'SES send failed');
      throw err;
    }
  }

  private normalizeRecipients(to: SendEmail['to']): string[] {
    if (Array.isArray(to)) {
      return to;
    }
    return [to];
  }
}
