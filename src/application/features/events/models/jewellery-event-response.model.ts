import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EJewelleryEventStatus } from '../domain';

export class JewelleryEventResponseModel {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  slug!: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  startDate?: Date | null;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  endDate?: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  city?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  state?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  country?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  venue?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  organizer?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  category?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  website?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  registrationUrl?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  sourceUrl?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  visitorEntryFee?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  stallFee?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  contactEmail?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  contactPhone?: string | null;

  @Expose()
  @ApiPropertyOptional({ type: [String] })
  tags?: string[];

  @Expose()
  @ApiProperty({ enum: EJewelleryEventStatus })
  status!: EJewelleryEventStatus;

  @Expose()
  @ApiProperty()
  isFeatured!: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  seoTitle?: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  seoDescription?: string | null;

  @Expose()
  @ApiPropertyOptional({ type: Date })
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  @ApiPropertyOptional({ type: Date })
  @Type(() => Date)
  updatedAt?: Date;
}

export class JewelleryEventsPagedResponseModel {
  @Expose()
  @ApiProperty({ type: [JewelleryEventResponseModel] })
  @Type(() => JewelleryEventResponseModel)
  items!: JewelleryEventResponseModel[];

  @Expose()
  @ApiProperty()
  page!: number;

  @Expose()
  @ApiProperty()
  perPage!: number;

  @Expose()
  @ApiProperty()
  totalCount!: number;
}

export class JewelleryEventDetailResponseModel extends JewelleryEventResponseModel {
  @Expose()
  @ApiPropertyOptional({ type: [JewelleryEventResponseModel] })
  @Type(() => JewelleryEventResponseModel)
  relatedEvents?: JewelleryEventResponseModel[];
}
