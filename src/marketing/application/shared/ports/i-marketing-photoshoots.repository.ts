import { Photoshoot } from '../domain';
export const MARKETING_PHOTOSHOOTS_REPOSITORY = 'MARKETING_PHOTOSHOOTS_REPOSITORY';

export interface IMarketingPhotoshootsRepository {
  create(shoot: Omit<Photoshoot, 'id'>): Promise<Photoshoot>;
  findById(id: string): Promise<Photoshoot | null>;
  findForUser(id: string, userId: string): Promise<Photoshoot | null>;
  listForUser(userId: string, limit: number): Promise<Photoshoot[]>;
  update(id: string, patch: Partial<Photoshoot>): Promise<Photoshoot | null>;
  delete(id: string): Promise<void>;
  countActiveForUser(userId: string): Promise<number>;
}
