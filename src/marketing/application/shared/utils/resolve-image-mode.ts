import { DEFAULT_MARKETING_IMAGE_MODE, MARKETING_IMAGE_MODES, MarketingImageMode } from '../enums';

/** The requested image mode, or the default (exact product) when missing or unknown. */
export function resolveImageMode(value?: string | null): MarketingImageMode {
  return (MARKETING_IMAGE_MODES as readonly string[]).includes(value ?? '')
    ? (value as MarketingImageMode)
    : DEFAULT_MARKETING_IMAGE_MODE;
}
