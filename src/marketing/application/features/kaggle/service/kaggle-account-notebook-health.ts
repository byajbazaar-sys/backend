import { KaggleNotebookHealth } from './kaggle-notebook-health';

export interface KaggleAccountNotebookHealth {
  account: string;
  accountStatus: string;
  video: KaggleNotebookHealth;
  image: KaggleNotebookHealth;
}
