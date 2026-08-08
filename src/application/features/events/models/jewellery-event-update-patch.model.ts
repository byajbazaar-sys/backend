import { EJewelleryEventStatus } from '../domain';

export interface JewelleryEventUpdatePatch {
  name?: string;
  slug?: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  venue?: string | null;
  organizer?: string | null;
  category?: string | null;
  website?: string | null;
  registrationUrl?: string | null;
  sourceUrl?: string | null;
  visitorEntryFee?: string | null;
  stallFee?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  tags?: string[];
  status?: EJewelleryEventStatus;
  isFeatured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
}
