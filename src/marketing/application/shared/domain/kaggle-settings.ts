/** Kaggle health behaviour, editable by admins. */
export interface KaggleSettings {
  /**
   * Fix stuck renders without an admin: re-run failed account setups after 30 minutes (instead of 6 hours), move a
   * render that Kaggle keeps queued or that never booted to another account, restart silent sessions sooner.
   */
  autoRecover: boolean;
  /**
   * A warm worker session with nothing to do stays alive this many minutes (models stay loaded, the next job starts
   * at once), then stops to save GPU quota. Only the last idle session waits this long; extra idle ones stop sooner.
   */
  warmIdleMinutes: number;
}

export const DEFAULT_KAGGLE_SETTINGS: KaggleSettings = { autoRecover: true, warmIdleMinutes: 45 };
