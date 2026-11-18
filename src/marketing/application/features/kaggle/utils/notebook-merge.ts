export interface NotebookMerge {
  /** Clip keys in play order (scenes); the logo clip is appended at the end. */
  order: string[];
  /** Download URLs for clips not rendered in this session. */
  sources: Record<string, string>;
  logoKey?: string;
  logoUrl?: string;
  uploadUrl: string;
}
