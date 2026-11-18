export const FACE_VECTOR_INDEX = 'IFaceVectorIndex';

export interface FaceVectorPayload {
  userId: string;
  customerId: string;
  customerName: string;
  profilePhotoRef?: string;
}

export interface FaceVectorSearchHit {
  id: string;
  score: number;
  payload: FaceVectorPayload;
}

/** Stores customer face embeddings per business and finds the closest ones (implemented by the Qdrant client). */
export interface IFaceVectorIndex {
  upsertFace(pointId: string, vector: number[], payload: FaceVectorPayload): Promise<void>;
  deleteFace(pointId: string): Promise<void>;
  search(userId: string, vector: number[], limit?: number): Promise<FaceVectorSearchHit[]>;
  countIndexed(userId: string): Promise<number>;
}
