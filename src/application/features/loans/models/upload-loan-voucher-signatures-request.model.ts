import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadLoanVoucherSignaturesRequestModel {
  @Expose()
  @ApiProperty({ description: 'Name of the signer', example: 'Meena Devi Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  signerName: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Set to true to remove stored fingerprint image without uploading a new file',
    example: 'false',
  })
  @IsOptional()
  @IsString()
  removeFingerprint?: string;
}
