import { GpuProvider } from './gpu-provider';

/** One GPU account (Kaggle or Colab Enterprise) that can run render notebooks. */
export interface KaggleWorker {
  /** Kaggle username / Colab account id (used in kernel refs). */
  id: string;
  /** Parallel notebooks this account may run. */
  concurrency: number;
  /** Colab accounts cost money: they only take work no free Kaggle account can. */
  provider: GpuProvider;
  /** Colab: the account's own cap on one session's running time (billing safety). */
  maxSessionSeconds?: number;
}
