import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { StartMessagingOptions } from './options';
import { ISmsOtpSender } from '../../application/shared/services/i-sms-otp.sender';

const REQUEST_TIMEOUT_MS = 15_000;

interface StartMessagingError {
  success?: boolean;
  statusCode?: number;
  error?: { code?: string; message?: string; details?: { message?: string }[] };
}

/**
 * StartMessaging OTP SMS (https://api.startmessaging.com, `POST /otp/send`, `X-API-Key`).
 * The account's API only delivers codes — there is no verify endpoint — so we pass our own
 * code in `variables.otp` and verify it ourselves.
 */
@Injectable()
export class StartMessagingService implements ISmsOtpSender {
  constructor(
    private readonly options: StartMessagingOptions,
    @InjectPinoLogger(StartMessagingService.name) private readonly logger: PinoLogger,
  ) {}

  isConfigured(): boolean {
    return !!this.options?.apiKey?.trim();
  }

  async sendOtp(phoneE164: string, code: string, expiryMinutes: number): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.error('START_MESSAGING_API_KEY is not configured');
      throw new ServiceUnavailableException('SMS verification is not available right now. Please try again later.');
    }

    const body: Record<string, unknown> = {
      phoneNumber: phoneE164,
      variables: { otp: code, appName: this.options.appName, expiry: String(expiryMinutes) },
    };
    if (this.options.templateId?.trim()) {
      body.templateId = this.options.templateId.trim();
    }

    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.options.apiKey.trim() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error({ err }, 'StartMessaging request failed');
      throw new ServiceUnavailableException('Could not send the SMS. Please try again.');
    }

    if (response.ok) return;

    const payload = (await response.json().catch(() => ({}))) as StartMessagingError;
    const providerMessage = payload.error?.details?.[0]?.message || payload.error?.message;
    // Never log the code itself.
    this.logger.warn(
      { status: response.status, code: payload.error?.code, message: providerMessage },
      'StartMessaging rejected OTP send',
    );
    if (response.status === 429) {
      throw new BadRequestException('Too many codes sent to this number. Please wait a few minutes and try again.');
    }
    if (response.status === 400) {
      throw new BadRequestException(providerMessage || 'Please enter a valid Indian mobile number.');
    }
    throw new ServiceUnavailableException('Could not send the SMS. Please try again.');
  }
}
