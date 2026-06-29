import { Type } from '@nestjs/common';
import { SendGridService } from '../send-grid';
import { SesService } from '../ses';
import { ResendService } from '../resend';
import { IEmailService } from '../../application';

export function resolveEmailServiceProvider(): Type<IEmailService> {
  switch (process.env.EMAIL_SERVICE_PROVIDER) {
    case 'ses':
      return SesService;
    case 'resend':
      return ResendService;
    case 'sendgrid':
    default:
      return SendGridService;
  }
}
