/** One Workers AI call, for the usage log. */
export interface CloudflareCallInfo {
  /** try-on, recolor, background-removal, marketing-image, text-to-image, text */
  operation: string;
  model: string;
  durationMs: number;
}
