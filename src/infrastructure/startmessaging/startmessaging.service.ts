import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

import { StartMessagingOptions } from './startmessaging.options';
import { IStartMessagingService } from '../../application/features/auth/services/i-startmessaging.service';

interface ProviderResponse {
  requestId?: string;
  success?: boolean;
  verified?: boolean;
  status?: string;
  data?: {
    requestId?: string;
    success?: boolean;
    verified?: boolean;
    status?: string;
  };
}

@Injectable()
export class StartMessagingService implements IStartMessagingService {
  private readonly baseUrl = 'https://api.startmessaging.com/otp';

  constructor(private readonly options: StartMessagingOptions) {}

  async sendOtp(phoneNumber: string, otp: string): Promise<string> {
    this.assertConfigured();
    try {
      const response = await axios.post<ProviderResponse>(
        `${this.baseUrl}/send`,
        {
          phoneNumber,
          templateId: this.options.templateId,
          variables: { otp, appName: this.options.appName },
        },
        {
          headers: { 'X-API-Key': this.options.apiKey, 'Content-Type': 'application/json' },
          timeout: this.options.timeoutMs,
          maxRedirects: 0,
        },
      );
      const requestId = response.data?.requestId ?? response.data?.data?.requestId;
      if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 256) {
        throw new BadGatewayException('SMS provider returned an invalid OTP request');
      }
      return requestId;
    } catch (error) {
      this.throwProviderError(error, 'SMS provider could not send the verification code');
    }
  }

  async verifyOtp(requestId: string, otpCode: string): Promise<boolean> {
    this.assertConfigured();
    try {
      const response = await axios.post<ProviderResponse>(
        `${this.baseUrl}/verify`,
        { requestId, otpCode },
        {
          headers: { 'X-API-Key': this.options.apiKey, 'Content-Type': 'application/json' },
          timeout: this.options.timeoutMs,
          maxRedirects: 0,
        },
      );
      const result = response.data?.data ?? response.data;
      return result?.verified === true || result?.success === true || result?.status === 'verified';
    } catch (error) {
      this.throwProviderError(error, 'SMS provider could not verify the code');
    }
  }

  private assertConfigured(): void {
    if (!this.options.apiKey || !this.options.templateId || !this.options.appName) {
      throw new ServiceUnavailableException('SMS verification is not configured');
    }
  }

  private throwProviderError(error: unknown, fallback: string): never {
    if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      const status = (error as AxiosError).response?.status;
      if (status && status >= 400 && status < 500) {
        throw new BadGatewayException(fallback);
      }
      throw new ServiceUnavailableException(fallback);
    }
    throw new BadGatewayException(fallback);
  }
}
