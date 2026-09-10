import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

import { FaceCompareOptions } from './face-compare.options';

export interface QdrantFacePayload {
  userId: string;
  customerId: string;
  customerName: string;
  profilePhotoRef?: string;
}

export interface QdrantSearchHit {
  id: string;
  score: number;
  payload: QdrantFacePayload;
}

@Injectable()
export class QdrantClient {
  private readonly http: AxiosInstance;

  constructor(private readonly options: FaceCompareOptions) {
    const baseURL = options.qdrantUrl.replace(/\/+$/, '');
    this.http = axios.create({
      baseURL,
      timeout: options.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'api-key': options.qdrantApiKey,
      },
      validateStatus: () => true,
    });
  }

  async ensureCollection(): Promise<void> {
    const name = this.options.collectionName;
    const existing = await this.http.get(`/collections/${name}`);
    if (existing.status !== 200) {
      const created = await this.http.put(`/collections/${name}`, {
        vectors: {
          size: this.options.vectorSize,
          distance: 'Cosine',
        },
      });
      if (created.status < 200 || created.status >= 300) {
        throw new Error(`Failed to create Qdrant collection (${created.status})`);
      }
    }

    // Required for userId filter on search/count (Qdrant returns 400 without this index).
    await this.http.put(`/collections/${name}/index`, {
      field_name: 'userId',
      field_schema: 'keyword',
    });
  }

  async upsertFace(pointId: string, vector: number[], payload: QdrantFacePayload): Promise<void> {
    await this.ensureCollection();
    const response = await this.http.put(`/collections/${this.options.collectionName}/points`, {
      wait: true,
      points: [{ id: pointId, vector, payload }],
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Qdrant upsert failed (${response.status})`);
    }
  }

  async deleteFace(pointId: string): Promise<void> {
    const response = await this.http.post(`/collections/${this.options.collectionName}/points/delete`, {
      wait: true,
      points: [pointId],
    });
    if (response.status === 404) return;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Qdrant delete failed (${response.status})`);
    }
  }

  async search(userId: string, vector: number[], limit = 5): Promise<QdrantSearchHit[]> {
    await this.ensureCollection();
    const response = await this.http.post<{ result?: Array<{ id: string; score: number; payload?: QdrantFacePayload }> }>(
      `/collections/${this.options.collectionName}/points/search`,
      {
        vector,
        limit,
        with_payload: true,
        score_threshold: this.options.matchThreshold,
        filter: {
          must: [{ key: 'userId', match: { value: userId } }],
        },
      },
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Qdrant search failed (${response.status})`);
    }

    return (response.data?.result ?? [])
      .filter((hit) => hit.payload?.customerId)
      .map((hit) => ({
        id: String(hit.id),
        score: hit.score,
        payload: hit.payload as QdrantFacePayload,
      }));
  }

  async countIndexed(userId: string): Promise<number> {
    await this.ensureCollection();
    const response = await this.http.post<{ result?: { count?: number } }>(
      `/collections/${this.options.collectionName}/points/count`,
      {
        exact: true,
        filter: {
          must: [{ key: 'userId', match: { value: userId } }],
        },
      },
    );
    if (response.status < 200 || response.status >= 300) return 0;
    return response.data?.result?.count ?? 0;
  }
}
