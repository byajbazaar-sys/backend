import { Type } from '@nestjs/common';

import { IEmailService } from '../../application';
import { ResendService } from '../resend';
import { SendGridService } from '../send-grid';
import { SesService } from '../ses';

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
