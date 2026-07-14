import { Expose, Type } from 'class-transformer';
import { EJewelleryEventStatus } from './enums';

export class JewelleryEvent {
  @Expose()
  id?: string;

  @Expose()
  name!: string;

  @Expose()
  slug!: string;

  @Expose()
  description?: string | null;

  @Expose()
  @Type(() => Date)
  startDate?: Date | null;

  @Expose()
  @Type(() => Date)
  endDate?: Date | null;

  @Expose()
  city?: string | null;

  @Expose()
  state?: string | null;

  @Expose()
  country?: string | null;

  @Expose()
  venue?: string | null;

  @Expose()
  organizer?: string | null;

  @Expose()
  category?: string | null;

  @Expose()
  website?: string | null;

  @Expose()
  registrationUrl?: string | null;

  @Expose()
  sourceUrl?: string | null;

  @Expose()
  visitorEntryFee?: string | null;

  @Expose()
  stallFee?: string | null;

  @Expose()
  contactEmail?: string | null;

  @Expose()
  contactPhone?: string | null;

  @Expose()
  tags?: string[];

  @Expose()
  status!: EJewelleryEventStatus;

  @Expose()
  isFeatured!: boolean;

  @Expose()
  seoTitle?: string | null;

  @Expose()
  seoDescription?: string | null;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  @Type(() => Date)
  updatedAt?: Date;
}
