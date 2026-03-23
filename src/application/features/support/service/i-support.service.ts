import { SupportRequest } from '../domain';

export const SUPPORT_SERVICE = 'ISupportService';

export interface ISupportService {
  submitRequest(data: SupportRequest): Promise<SupportRequest>;
}
