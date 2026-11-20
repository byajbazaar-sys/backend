import { Voiceover } from '../domain';
export const MARKETING_VOICEOVERS_REPOSITORY = 'MARKETING_VOICEOVERS_REPOSITORY';

export interface IMarketingVoiceoversRepository {
  create(voiceover: Omit<Voiceover, 'id'>): Promise<Voiceover>;
  findById(id: string): Promise<Voiceover | null>;
  findForUser(id: string, userId: string): Promise<Voiceover | null>;
  listForUser(userId: string, limit: number): Promise<Voiceover[]>;
  update(id: string, patch: Partial<Voiceover>): Promise<Voiceover | null>;
  delete(id: string): Promise<void>;
  countActiveForUser(userId: string): Promise<number>;
}
