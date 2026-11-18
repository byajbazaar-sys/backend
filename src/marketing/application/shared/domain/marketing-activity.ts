export interface MarketingActivity {
  /** e.g. CAMPAIGN_CREATED, RENDER_JOB_FAILED, KAGGLE_ACCOUNT_ADDED */
  action: string;
  /** campaign | photoshoot | render_job | kaggle_account */
  entityType: string;
  entityId?: string | null;
  /** The business (ByajBazaar user) it belongs to, if any. */
  userId?: string | null;
  /** Never secrets (Kaggle keys). */
  data?: Record<string, unknown>;
}
