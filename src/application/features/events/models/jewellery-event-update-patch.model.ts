import { EJewelleryEventStatus } from '../domain';

export interface JewelleryEventUpdatePatch {
  name?: string;
  slug?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  city?: string;
  state?: string;
  country?: string;
  venue?: string;
  organizer?: string;
  category?: string;
  website?: string;
  registrationUrl?: string;
  sourceUrl?: string;
  visitorEntryFee?: string;
  stallFee?: string;
  contactEmail?: string;
  contactPhone?: string;
  tags?: string[];
  status?: EJewelleryEventStatus;
  isFeatured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}
