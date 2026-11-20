import { Voiceover } from '../../../shared';
import { KaggleJobStatusView } from '../../kaggle';

/** A voiceover as the API returns it (file keys replaced by URLs). */
export type VoiceoverView = Omit<Voiceover, 'sampleKey' | 'audioKey' | 'userId'> & {
  audioUrl?: string;
  sampleUrl?: string;
  voiceJob?: KaggleJobStatusView | null;
};
