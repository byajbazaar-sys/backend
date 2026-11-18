import { SceneView } from './scene-view';
import { MarketingCampaign } from '../../../shared';
import { KaggleJobStatusView } from '../../kaggle';

export interface CampaignView extends MarketingCampaign {
  sourceImageUrl?: string;
  mergedVideoUrl?: string;
  /** First ready scene image, for lists. */
  coverImageUrl?: string;
  coverSceneIndex?: number;
  scenes?: SceneView[];
  /** Latest run of the Kaggle image notebook (scene images). */
  imageJob?: KaggleJobStatusView;
  /** Latest run of the Kaggle video notebook (scene clips + merge). */
  videoJob?: KaggleJobStatusView;
}
