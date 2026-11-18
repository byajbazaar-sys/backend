export interface RenderClipSpec {
  /** "scene-0" … "scene-4", or "logo". */
  key: string;
  sceneId?: string;
  imageKey: string;
  prompt: string;
  /** Destination key in the marketing bucket. */
  outputKey: string;
}
