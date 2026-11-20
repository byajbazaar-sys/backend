import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ColabSettingsResponseModel {
  @ApiProperty() @Expose() projectId: string;
  @ApiProperty() @Expose() region: string;
  @ApiProperty() @Expose() bucket: string;
  @ApiProperty() @Expose() serviceAccountEmail: string;
  @ApiProperty() @Expose() machineType: string;
  @ApiProperty({ enum: ['NVIDIA_TESLA_T4', 'NVIDIA_L4'] }) @Expose() acceleratorType: string;
  @ApiProperty() @Expose() acceleratorCount: number;
  @ApiProperty() @Expose() diskSizeGb: number;
  @ApiProperty() @Expose() maxSessionHours: number;
}
