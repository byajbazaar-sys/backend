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
  description?: string;

  @Expose()
  @Type(() => Date)
  startDate?: Date;

  @Expose()
  @Type(() => Date)
  endDate?: Date;

  @Expose()
  city?: string;

  @Expose()
  state?: string;

  @Expose()
  country?: string;

  @Expose()
  venue?: string;

  @Expose()
  organizer?: string;

  @Expose()
  category?: string;

  @Expose()
  website?: string;

  @Expose()
  registrationUrl?: string;

  @Expose()
  sourceUrl?: string;

  @Expose()
  visitorEntryFee?: string;

  @Expose()
  stallFee?: string;

  @Expose()
  contactEmail?: string;

  @Expose()
  contactPhone?: string;

  @Expose()
  tags?: string[];

  @Expose()
  status!: EJewelleryEventStatus;

  @Expose()
  isFeatured!: boolean;

  @Expose()
  seoTitle?: string;

  @Expose()
  seoDescription?: string;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  @Type(() => Date)
  updatedAt?: Date;
}
