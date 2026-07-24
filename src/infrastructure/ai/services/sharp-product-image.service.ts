import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  GeneratedAiImage,
  IProductImageAiService,
  ProductImageInput,
} from '../../../application';
import { stripDataUrl } from '../utils/image.util';
import {
  ensureTransparentProductPng,
  removeSolidColorBackground,
} from '../utils/product-image.util';

@Injectable()
export class SharpProductImageService implements IProductImageAiService {
  constructor(
    @InjectPinoLogger(SharpProductImageService.name) private readonly logger: PinoLogger,
  ) {}

  async removeProductBackground(image: ProductImageInput): Promise<GeneratedAiImage> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    const started = Date.now();

    const cutout = await removeSolidColorBackground(input);
    const polished = await ensureTransparentProductPng(cutout);

    this.logger.info(
      {
        provider: 'sharp',
        inputBytes: input.length,
        outputBytes: polished.length,
        durationMs: Date.now() - started,
      },
      'Product background removed (solid-color segmentation)',
    );

    return {
      base64: polished.toString('base64'),
      mimeType: 'image/png',
    };
  }
}
