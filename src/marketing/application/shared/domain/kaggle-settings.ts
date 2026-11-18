/** Kaggle health behaviour, editable by admins. */
export interface KaggleSettings {
  /**
   * Fix stuck renders without an admin: re-run failed account setups after 30 minutes (instead of 6 hours), move a
   * render that Kaggle keeps queued or that never booted to another account, restart silent sessions sooner.
   */
  autoRecover: boolean;
}

export const DEFAULT_KAGGLE_SETTINGS: KaggleSettings = { autoRecover: true };
