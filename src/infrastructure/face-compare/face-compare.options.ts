export class FaceCompareOptions {
  constructor(
    /** FaceMatch / InsightFace VM base URL, e.g. http://140.245.93.109:8000 */
    public insightFaceApiUrl = '',
    public qdrantUrl = '',
    public qdrantApiKey = '',
    public collectionName = 'customer_faces',
    public vectorSize = 512,
    /** Minimum cosine similarity score (0–1) for a match. */
    public matchThreshold = 0.45,
    public timeoutMs = 30_000,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.insightFaceApiUrl?.trim() && this.qdrantUrl?.trim() && this.qdrantApiKey?.trim());
  }
}
