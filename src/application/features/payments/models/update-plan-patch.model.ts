export interface UpdatePlanPatch {
  name?: string;
  price?: number;
  currency?: string;
  interval?: string;
  intervalCount?: number;
  providerPlanId?: string;
  active?: boolean;
}
