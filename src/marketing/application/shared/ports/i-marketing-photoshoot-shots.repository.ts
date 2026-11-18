import { PhotoshootShot } from '../domain';
export const MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY = 'MARKETING_PHOTOSHOOT_SHOTS_REPOSITORY';

export interface IMarketingPhotoshootShotsRepository {
  createMany(shots: Omit<PhotoshootShot, 'id'>[]): Promise<PhotoshootShot[]>;
  listFor(photoshootIds: string[]): Promise<PhotoshootShot[]>;
  findByIndex(photoshootId: string, index: number): Promise<PhotoshootShot | null>;
  update(id: string, patch: Partial<PhotoshootShot>): Promise<PhotoshootShot | null>;
}
