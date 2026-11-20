import { VoiceoverSettings } from '../../../shared';

export interface CreateVoiceoverInput {
  title?: string;
  text: string;
  language: string;
  sample?: { base64: string; mimeType: string };
  /** Reuse the sample of an earlier voiceover of the same user. */
  sampleFromId?: string;
  settings?: Partial<VoiceoverSettings>;
}
