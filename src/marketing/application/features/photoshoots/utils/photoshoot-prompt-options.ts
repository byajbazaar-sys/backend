import { PhotoshootModel, PhotoshootOutfit, PhotoshootSetting } from '../../../shared';

export interface PhotoshootPromptOptions {
  setting: PhotoshootSetting;
  model: PhotoshootModel;
  outfit: PhotoshootOutfit;
}
