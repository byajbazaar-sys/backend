export interface ShopInviteTemplateData {
  shopName: string;
  inviterName: string;
  roleLabel: string;
  email: string;
  inviteUrl: string;
  expiresDays: number;
  appName?: string;
  year?: number;
}
