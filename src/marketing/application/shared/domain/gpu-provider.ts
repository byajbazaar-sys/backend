/** Where a GPU account runs its notebooks: Kaggle (free weekly quota) or Colab Enterprise (Google Cloud, billed). */
export type GpuProvider = 'kaggle' | 'colab';

export const GPU_PROVIDERS: readonly GpuProvider[] = ['kaggle', 'colab'];
