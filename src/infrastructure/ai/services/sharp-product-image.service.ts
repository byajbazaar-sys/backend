import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { GeneratedAiImage, IProductImageAiService, ProductImageInput } from '../../../application';
import { stripDataUrl } from '../utils/image.util';
import {
  ensureTransparentProductPng,
  flattenExteriorBackgroundToWhite,
  removeSolidColorBackground,
  compressPngForApiPreview,
} from '../utils/product-image.util';

@Injectable()
export class SharpProductImageService implements IProductImageAiService {
  constructor(@InjectPinoLogger(SharpProductImageService.name) private readonly logger: PinoLogger) {}

  async removeProductBackground(image: ProductImageInput): Promise<GeneratedAiImage> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    const started = Date.now();

    const cutout = await removeSolidColorBackground(input);

    this.logger.info(
      {
        provider: 'sharp',
        inputBytes: input.length,
        outputBytes: cutout.length,
        durationMs: Date.now() - started,
      },
      'Product white background removed (solid-color segmentation)',
    );

    return {
      base64: cutout.toString('base64'),
      mimeType: 'image/png',
    };
  }

  async flattenProductBackgroundToWhite(image: ProductImageInput): Promise<GeneratedAiImage> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    const started = Date.now();
    const flattened = await flattenExteriorBackgroundToWhite(input);

    this.logger.info(
      {
        provider: 'sharp',
        inputBytes: input.length,
        outputBytes: flattened.length,
        durationMs: Date.now() - started,
      },
      'Product exterior backdrop flattened to white',
    );

    return {
      base64: flattened.toString('base64'),
      mimeType: 'image/png',
    };
  }

  async polishTransparentPng(image: ProductImageInput): Promise<GeneratedAiImage> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    const polished = await ensureTransparentProductPng(input);
    return { base64: polished.toString('base64'), mimeType: 'image/png' };
  }

  async compressPngForPreview(image: ProductImageInput): Promise<GeneratedAiImage> {
    const input = Buffer.from(stripDataUrl(image.base64), 'base64');
    const compressed = await compressPngForApiPreview(input);
    return { base64: compressed.toString('base64'), mimeType: 'image/png' };
  }
}
