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
  description?: string;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  startDate?: Date;

  @Expose()
  @ApiPropertyOptional({ type: Date, nullable: true })
  @Type(() => Date)
  endDate?: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  city?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  state?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  country?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  venue?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  organizer?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  category?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  website?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  registrationUrl?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  sourceUrl?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  visitorEntryFee?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  stallFee?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  contactEmail?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  contactPhone?: string;

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
  seoTitle?: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  seoDescription?: string;

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
