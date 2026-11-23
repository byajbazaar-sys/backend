import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { InboxFaqModel } from './inbox-faq.model';

export class InboxChannelStatusModel {
  @Expose() @ApiProperty() connected: boolean;
  @Expose() @ApiProperty() ready: boolean;
  @Expose() @ApiPropertyOptional() reason?: string;
}

export class InboxChannelsStatusModel {
  @Expose()
  @ApiProperty({ type: InboxChannelStatusModel })
  @Type(() => InboxChannelStatusModel)
  whatsapp: InboxChannelStatusModel;
  @Expose()
  @ApiProperty({ type: InboxChannelStatusModel })
  @Type(() => InboxChannelStatusModel)
  instagram: InboxChannelStatusModel;
}

export class InboxSettingsModel {
  @Expose() @ApiProperty() whatsappEnabled: boolean;
  @Expose() @ApiProperty() instagramEnabled: boolean;
  @Expose() @ApiProperty() answerShopInfo: boolean;
  @Expose() @ApiProperty() answerRates: boolean;
  @Expose() @ApiProperty() answerCatalogue: boolean;
  @Expose() @ApiProperty() answerAccount: boolean;
  @Expose() @ApiPropertyOptional() businessHours: string | null;
  @Expose() @ApiPropertyOptional() about: string | null;
  @Expose() @ApiProperty({ type: [InboxFaqModel] }) @Type(() => InboxFaqModel) faqs: InboxFaqModel[];
  @Expose() @ApiPropertyOptional() instructions: string | null;
  @Expose() @ApiPropertyOptional() handoffMessage: string | null;
  @Expose() @ApiProperty() notifyEmail: boolean;
  @Expose() @ApiProperty() notifyPush: boolean;
}

export class InboxSettingsResponseModel {
  @Expose() @ApiProperty({ type: InboxSettingsModel }) @Type(() => InboxSettingsModel) settings: InboxSettingsModel;
  @Expose()
  @ApiProperty({ type: InboxChannelsStatusModel })
  @Type(() => InboxChannelsStatusModel)
  channels: InboxChannelsStatusModel;
}
