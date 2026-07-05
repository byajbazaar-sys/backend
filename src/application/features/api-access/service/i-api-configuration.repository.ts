import { ApiConfiguration } from '../domain';

export const API_CONFIGURATION_REPOSITORY = 'API_CONFIGURATION_REPOSITORY';

export interface IApiConfigurationRepository {
  findById(id: string): Promise<ApiConfiguration | null>;
  findByUserId(userId: string): Promise<ApiConfiguration | null>;
  findByApiKey(apiKey: string): Promise<ApiConfiguration | null>;
  save(configuration: ApiConfiguration): Promise<ApiConfiguration>;
  deleteByUserId(userId: string): Promise<void>;
  updateStatus(userId: string, isActive: boolean): Promise<ApiConfiguration>;
  touchLastUsed(id: string, at?: Date): Promise<void>;
}
