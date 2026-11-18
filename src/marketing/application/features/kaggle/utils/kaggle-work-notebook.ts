import { KaggleNotebook } from './kaggle-notebook';

/** The notebooks that do render work (account setup excluded). */
export type KaggleWorkNotebook = Exclude<KaggleNotebook, 'setup'>;

export const KAGGLE_WORK_NOTEBOOKS: readonly KaggleWorkNotebook[] = ['image', 'video'];
