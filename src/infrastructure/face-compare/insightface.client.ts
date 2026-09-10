import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { FaceCompareOptions } from './face-compare.options';

interface FacematchEmbedFace {
  embedding?: number[];
  confidence?: number;
}

interface FacematchEmbedResponse {
  faces?: FacematchEmbedFace[];
  detail?: string;
}

export type FacematchEmbedPurpose = 'index' | 'compare';

@Injectable()
export class InsightFaceClient {
  constructor(
    private readonly options: FaceCompareOptions,
    @InjectPinoLogger(InsightFaceClient.name) private readonly logger: PinoLogger,
  ) {}

  async extractEmbedding(imageBuffer: Buffer, purpose: FacematchEmbedPurpose = 'compare'): Promise<number[]> {
    if (!this.options.insightFaceApiUrl?.trim()) {
      throw new BadRequestException(
        'Face compare API is not configured (FACE_COMPARE_API_URL / INSIGHTFACE_API_URL missing)',
      );
    }

    const baseUrl = this.options.insightFaceApiUrl.replace(/\/+$/, '');
    const form = new FormData();
    form.append('file', imageBuffer, {
      filename: 'face.jpg',
      contentType: 'image/jpeg',
    });

    const response = await axios.post<FacematchEmbedResponse>(
      `${baseUrl}/embed?purpose=${purpose}`,
      form,
      {
        headers: form.getHeaders(),
        timeout: this.options.timeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
      },
    );

    if (response.status < 200 || response.status >= 300) {
      const detail = response.data?.detail || `Face embed failed with status ${response.status}`;
      this.logger.warn({ status: response.status, purpose, detail }, 'Facematch embed failed');
      throw new BadRequestException(detail);
    }

    const best = (response.data?.faces ?? [])
      .filter((face) => Array.isArray(face.embedding) && face.embedding.length > 0)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

    if (!best?.embedding?.length) {
      throw new BadRequestException('No face detected in the photo. Use a clear, front-facing image.');
    }

    return best.embedding;
  }
}
