import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  IPushDevicesRepository,
  IPushNotificationService,
  PUSH_DEVICES_REPOSITORY,
  PushMessage,
} from '../../application';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Push notifications through Expo's push service (the mobile app is an Expo app). EXPO_ACCESS_TOKEN is needed only
 * when "enhanced push security" is on for the Expo project. Devices Expo reports as gone are forgotten.
 */
@Injectable()
export class ExpoPushNotificationService implements IPushNotificationService {
  constructor(
    @Inject(PUSH_DEVICES_REPOSITORY) private readonly devices: IPushDevicesRepository,
    @InjectPinoLogger(ExpoPushNotificationService.name) private readonly logger: PinoLogger,
  ) {}

  async sendToUser(userId: string, message: PushMessage): Promise<number> {
    try {
      const devices = await this.devices.listForUser(userId);
      if (!devices.length) return 0;
      const token = process.env.EXPO_ACCESS_TOKEN?.trim();
      const response = await axios.post<{ data?: ExpoTicket[] }>(
        EXPO_PUSH_URL,
        devices.map((device) => ({
          to: device.token,
          title: message.title.slice(0, 120),
          body: message.body.slice(0, 240),
          data: message.data ?? {},
          sound: 'default',
          priority: 'high',
          channelId: message.channelId ?? 'inbox',
        })),
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          timeout: 10_000,
        },
      );
      const tickets = response.data?.data ?? [];
      const gone = tickets
        .map((ticket, index) => (ticket.details?.error === 'DeviceNotRegistered' ? devices[index]?.token : null))
        .filter((value): value is string => !!value);
      if (gone.length) await this.devices.removeTokens(gone);
      const failed = tickets.filter((ticket) => ticket.status === 'error');
      if (failed.length) {
        this.logger.warn({ userId, errors: failed.map((t) => t.details?.error ?? t.message) }, 'Some pushes failed');
      }
      return tickets.filter((ticket) => ticket.status === 'ok').length;
    } catch (err) {
      this.logger.warn({ userId, err: (err as Error)?.message }, 'Push notification failed');
      return 0;
    }
  }
}
