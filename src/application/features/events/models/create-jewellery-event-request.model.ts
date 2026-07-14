import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EJewelleryEventStatus } from '../domain';

export class CreateJewelleryEventRequestModel {
  @Expose()
  @ApiProperty({ example: 'Indore Jewellery Exhibition 2026' })
  @IsString()
  @MinLength(2)
  @MaxLength(512)
  name!: string;

  @Expose()
  @ApiPropertyOptional({ example: 'indore-jewellery-exhibition-2026' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  slug?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @Expose()
  @ApiPropertyOptional({ example: '2026-08-15' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Expose()
  @ApiPropertyOptional({ example: '2026-08-18' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'Indore' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  city?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'Madhya Pradesh' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  state?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  country?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  venue?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  organizer?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  category?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  website?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  registrationUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  sourceUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  visitorEntryFee?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  stallFee?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactPhone?: string;

  @Expose()
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @Expose()
  @ApiPropertyOptional({ enum: EJewelleryEventStatus })
  @IsOptional()
  @IsEnum(EJewelleryEventStatus)
  status?: EJewelleryEventStatus;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  seoTitle?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string;
}

export class UpdateJewelleryEventRequestModel extends CreateJewelleryEventRequestModel {}
