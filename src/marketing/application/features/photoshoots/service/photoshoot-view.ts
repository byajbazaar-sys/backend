import { PhotoshootShotView } from './photoshoot-shot-view';
import { Photoshoot } from '../../../shared';
import { KaggleJobStatusView } from '../../kaggle';

export interface PhotoshootView extends Omit<Photoshoot, 'sourceImageKey'> {
  sourceImageUrl?: string;
  shots: PhotoshootShotView[];
  /** Latest run of the Kaggle image notebook for this shoot. */
  imageJob?: KaggleJobStatusView;
}
