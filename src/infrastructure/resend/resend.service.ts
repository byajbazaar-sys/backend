import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';

import { ResendOptions } from './options';
import { IEmailService, SendEmail } from '../../application';

@Injectable()
export class ResendService implements IEmailService {
  private readonly client: Resend;

  constructor(
    protected readonly options: ResendOptions,
    @InjectPinoLogger(ResendService.name) protected readonly logger: PinoLogger,
  ) {
    this.client = new Resend(this.options.apiKey);
  }

  async sendEmail(data: SendEmail): Promise<void> {
    const email = plainToInstance(SendEmail, data, { excludeExtraneousValues: true });
    this.logger.debug({ to: email.to }, 'sendEmail called');

    try {
      const response = await this.client.emails.send({
        from: this.formatFrom(email),
        to: this.normalizeRecipients(email.to),
        subject: email.subject,
        ...(email.isHtml ? { html: email.body } : { text: email.body }),
        attachments: email.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.type,
        })),
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      this.logger.info({ id: response.data?.id }, 'Resend send successful');
    } catch (err) {
      this.logger.error({ err, to: email.to }, 'Resend send failed');
      throw err;
    }
  }

  private formatFrom(email: SendEmail): string {
    const address = email.from?.email ?? this.options.sender;
    const name = email.from?.name ?? this.options.senderName;
    if (!address) {
      throw new Error('Resend sender address is not configured');
    }
    return name ? `${name} <${address}>` : address;
  }

  private normalizeRecipients(to: SendEmail['to']): string | string[] {
    if (Array.isArray(to)) {
      return to.length === 1 ? to[0] : to;
    }
    return to;
  }
}
