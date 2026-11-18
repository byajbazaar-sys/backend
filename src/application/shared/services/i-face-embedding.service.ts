import { FaceEmbeddingPurpose } from './face-embedding-purpose';

export const FACE_EMBEDDING_SERVICE = 'IFaceEmbeddingService';

/** Turns a face photo into an embedding vector (implemented by the InsightFace client). */
export interface IFaceEmbeddingService {
  extractEmbedding(imageBuffer: Buffer, purpose?: FaceEmbeddingPurpose): Promise<number[]>;
}
