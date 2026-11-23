import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { InboxFaqModel } from './inbox-faq.model';

/** Every field optional: only what is sent changes. Empty strings clear a text field. */
export class UpdateInboxSettingsRequestModel {
  @Expose() @ApiPropertyOptional() @IsOptional() @IsBoolean() whatsappEnabled?: boolean;
  @Expose() @ApiPropertyOptional() @IsOptional() @IsBoolean() instagramEnabled?: boolean;
  @Expose() @ApiPropertyOptional() @IsOptional() @IsBoolean() answerShopInfo?: boolean;
  @Expose() @ApiPropertyOptional() @IsOptional() @IsBoolean() answerRates?: boolean;
  @Expose() @ApiPropertyOptional() @IsOptional() @IsBoolean() answerCatalogue?: boolean;
  @Expose() @ApiPropertyOptional() @IsOptional() @IsBoolean() answerAccount?: boolean;
  @Expose() @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyEmail?: boolean;
  @Expose() @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyPush?: boolean;

  @Expose()
  @ApiPropertyOptional({ example: 'Mon–Sat 10:30 am – 8:30 pm, Sunday closed' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  businessHours?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Services, making charges, exchange / buy-back and other policies' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  about?: string;

  @Expose()
  @ApiPropertyOptional({ type: [InboxFaqModel] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => InboxFaqModel)
  faqs?: InboxFaqModel[];

  @Expose()
  @ApiPropertyOptional({ description: 'Extra guidance for the assistant (tone, what not to say)' })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  instructions?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'What customers are told when the assistant hands over (blank: automatic)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  handoffMessage?: string;
}
