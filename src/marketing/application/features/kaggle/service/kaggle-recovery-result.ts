export interface KaggleRecoveryResult {
  setupsRestarted: string[];
  cooldownsCleared: string[];
  jobsRestarted: { id: string; account: string | null; reason: string }[];
}
