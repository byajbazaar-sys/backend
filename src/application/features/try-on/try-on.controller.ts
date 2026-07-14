import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  CreateTryOnJobRequestModel,
  RecolorTryOnRequestModel,
  TryOnAssetResponseModel,
  TryOnAssetsListResponseModel,
  TryOnJobResponseModel,
} from './models';
import { ITryOnService, TRY_ON_SERVICE } from './try-on.service';

@ApiTags('try-on')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('try-on')
export class TryOnController {
  constructor(
    @InjectPinoLogger(TryOnController.name) private readonly logger: PinoLogger,
    @Inject(TRY_ON_SERVICE) private readonly tryOnService: ITryOnService,
  ) {}

  @Post('assets')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a custom try-on asset (necklace / earring / outfit) to S3' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image', 'type'],
      properties: {
        image: { type: 'string', format: 'binary' },
        type: { type: 'string', enum: ['necklace', 'earring', 'outfit', 'occasion'] },
        label: { type: 'string', description: 'Required for outfit and occasion uploads' },
        heightInInches: {
          type: 'number',
          description: 'Jewellery height/length in inches (recommended for earrings)',
        },
        color: { type: 'string', description: 'Optional default color for custom outfits' },
      },
    },
  })
  @ApiOkResponse({ type: TryOnAssetResponseModel })
  @UseInterceptors(FileInterceptor('image'))
  async uploadAsset(
    @Identity() identity: IIdentity,
    @UploadedFile() image: Express.Multer.File,
    @Body('type') type: string,
    @Body('label') label?: string,
    @Body('heightInInches') heightInInchesRaw?: string,
    @Body('color') color?: string,
  ): Promise<TryOnAssetResponseModel> {
    const heightInInches =
      heightInInchesRaw != null && heightInInchesRaw !== ''
        ? Number(heightInInchesRaw)
        : undefined;
    const asset = await this.tryOnService.uploadAsset(identity.userId, {
      type,
      label,
      heightInInches,
      color,
      file: image,
    });
    return plainToInstance(TryOnAssetResponseModel, asset, { excludeExtraneousValues: true });
  }

  @Get('assets')
  @ApiOperation({ summary: 'List custom try-on assets for the current user' })
  @ApiOkResponse({ type: TryOnAssetsListResponseModel })
  async listAssets(
    @Identity() identity: IIdentity,
    @Query('type') type?: string,
  ): Promise<TryOnAssetsListResponseModel> {
    const items = await this.tryOnService.listAssets(identity.userId, type);
    return plainToInstance(
      TryOnAssetsListResponseModel,
      {
        items: items.map((item) =>
          plainToInstance(TryOnAssetResponseModel, item, { excludeExtraneousValues: true }),
        ),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Delete('assets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom try-on asset' })
  async deleteAsset(
    @Identity() identity: IIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    await this.tryOnService.deleteAsset(identity.userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start jewellery / outfit virtual try-on job' })
  @ApiOkResponse({ type: TryOnJobResponseModel })
  async create(
    @Identity() identity: IIdentity,
    @Body() body: CreateTryOnJobRequestModel,
  ): Promise<TryOnJobResponseModel> {
    this.logger.info({ userId: identity.userId }, 'Try-on job requested');
    const job = await this.tryOnService.startTryOnJob(identity.userId, body);
    return plainToInstance(TryOnJobResponseModel, job, { excludeExtraneousValues: true });
  }

  @Post('recolor')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Recolor outfit fabric only (keeps face & jewellery)' })
  @ApiOkResponse({ type: TryOnJobResponseModel })
  async recolor(
    @Identity() identity: IIdentity,
    @Body() body: RecolorTryOnRequestModel,
  ): Promise<TryOnJobResponseModel> {
    const job = await this.tryOnService.startRecolorJob(identity.userId, body);
    return plainToInstance(TryOnJobResponseModel, job, { excludeExtraneousValues: true });
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll try-on job status / result' })
  @ApiOkResponse({ type: TryOnJobResponseModel })
  async getJob(
    @Identity() identity: IIdentity,
    @Param('jobId') jobId: string,
  ): Promise<TryOnJobResponseModel> {
    const job = await this.tryOnService.getJob(identity.userId, jobId);
    return plainToInstance(TryOnJobResponseModel, job, { excludeExtraneousValues: true });
  }
}
