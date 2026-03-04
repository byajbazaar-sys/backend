import { Injectable } from '@nestjs/common';
import { MailService } from '@sendgrid/mail';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { IEmailService, SendEmail } from '../../application';
import { SendGridOptions } from './options';

const HTML_MIME = 'text/html';
const TEXT_MIME = 'text/plain';

@Injectable()
export class SendGridService implements IEmailService {
  private readonly sendGrid: MailService;

  constructor(
    protected readonly options: SendGridOptions,
    @InjectPinoLogger(SendGridService.name) protected readonly logger: PinoLogger,
  ) {
    this.sendGrid = new MailService();
    this.sendGrid.setApiKey(this.options.apiKey);
  }

  async sendEmail(data: SendEmail): Promise<void> {
    const email = plainToInstance(SendEmail, data, { excludeExtraneousValues: true });
    this.logger.debug({ to: email.to }, 'sendEmail called');

    try {
      const to = this.normalizeRecipients(email.to);
      const from = email.from ?? {
        email: this.options.sender,
        name: this.options.senderName ?? this.options.sender,
      };

      const response = await this.sendGrid.send({
        to,
        from,
        subject: email.subject,
        content: [
          {
            type: email.isHtml ? HTML_MIME : TEXT_MIME,
            value: email.body,
          },
        ],
        attachments: email.attachments?.map((a) => ({
          content: a.content,
          filename: a.filename,
          type: a.type,
          disposition: a.disposition ?? 'attachment',
        })),
      });
      this.logger.info({ response }, 'SendGrid send successful');
    } catch (err) {
      this.logger.error({ err, to: email.to }, 'SendGrid send failed');
      throw err;
    }
  }

  private normalizeRecipients(to: SendEmail['to']): SendEmail['to'] {
    if (Array.isArray(to) && to.length === 1) {
      return to[0];
    }
    return to;
  }
}
