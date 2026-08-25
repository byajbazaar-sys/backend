export interface SaveApiConfigurationEntityInput {
  userId: string;
  apiKey: string;
  apiSecretHash: string;
  isActive: boolean;
  lastUsedAt?: Date;
}
