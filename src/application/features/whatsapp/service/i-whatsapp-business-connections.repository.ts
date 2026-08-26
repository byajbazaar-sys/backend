import {
  SaveWhatsAppBusinessConnectionData,
  WhatsAppBusinessConnection,
} from '../domain';
import { EWhatsAppConnectionStatus } from '../enums';

export const WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY = 'WHATSAPP_BUSINESS_CONNECTIONS_REPOSITORY';

export interface IWhatsAppBusinessConnectionsRepository {
  findByUserId(userId: string): Promise<WhatsAppBusinessConnection | null>;
  findByWabaAndPhoneNumberId(wabaId: string, phoneNumberId: string): Promise<WhatsAppBusinessConnection | null>;
  findEncryptedTokenByUserId(userId: string): Promise<string | null>;
  upsertConnection(
    userId: string,
    data: SaveWhatsAppBusinessConnectionData,
    accessTokenReference: string,
  ): Promise<WhatsAppBusinessConnection>;
  updateStatus(userId: string, connectionStatus: EWhatsAppConnectionStatus): Promise<void>;
}
