import { VoiceoverSettings } from './voiceover-settings';

/** Text spoken in the voice of an uploaded sample. */
export interface Voiceover {
  id: string;
  userId: string;
  title: string;
  text: string;
  /** ChatterBox language code (en, hi, es, …). */
  language: string;
  settings: VoiceoverSettings;
  /** The reference voice (6+ seconds), in the marketing bucket. */
  sampleKey: string;
  /** The generated speech (MP3) once ready. */
  audioKey: string | null;
  status: string;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
