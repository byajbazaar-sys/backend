import { MarketingBrand } from '../../../shared';

export interface BrandView extends MarketingBrand {
  logoImageUrl?: string;
  logoVideoUrl?: string;
  /** Logo on exported photos: on unless turned off. */
  logoOverlay: boolean;
  /** The logo that goes on photos (profile logo, else the generated one) and where it comes from. */
  overlayLogoUrl?: string;
  overlayLogoSource?: 'profile' | 'generated';
  /** The prepared logo (trimmed, as placed on photos) as a small PNG data URL, and whether it sits on a light card. */
  overlayLogoPreview?: string;
  overlayLogoCard?: boolean;
}
