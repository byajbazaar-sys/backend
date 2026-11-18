export const MARKETING_STYLES = ['studio', 'festive', 'luxury', 'minimal'] as const;

export type MarketingStyle = (typeof MARKETING_STYLES)[number];
