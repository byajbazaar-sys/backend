import { VoiceoverSettings } from '../../../shared';

/** What the voice notebook receives (one voiceover per job). */
export interface VoiceNotebookJob {
  jobId: string;
  token: string;
  wsUrl: string;
  apiBaseUrl?: string;
  voiceoverId: string;
  text: string;
  /** The node's language option, e.g. "Hindi (hi)". */
  languageLabel: string;
  settings: VoiceoverSettings;
  /** The reference voice (signed URL). */
  sampleUrl: string;
  /** Where to PUT the MP3. */
  uploadUrl: string;
}
