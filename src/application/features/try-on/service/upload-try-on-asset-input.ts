export interface UploadTryOnAssetInput {
  type: string;
  label?: string;
  heightInInches?: number;
  color?: string;
  file: Express.Multer.File;
}
