export enum EKaggleAccountStatus {
  /** Enabled in kaggle_credentials, setup not run yet. */
  New = 'NEW',
  SettingUp = 'SETTING_UP',
  Ready = 'READY',
  Failed = 'FAILED',
  /** Credentials removed or disabled in kaggle_credentials. */
  Disabled = 'DISABLED',
}
