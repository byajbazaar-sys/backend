import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EUserType } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

export class UserResponseModel {
  @Expose()
  @ApiProperty({ example: 'c9e5d9d4-9f0d-4f7a-9c6c-0f2a5a88a111' })
  id: string;

  @Expose()
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @Expose()
  @ApiProperty({ example: 'John' })
  firstName: string;

  @Expose()
  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @Expose()
  @ApiProperty({ example: '+15550000000', nullable: true, required: false })
  phoneNumber?: string;

  @Expose()
  @ApiProperty({ example: true })
  isActive: boolean;

  @Expose()
  @ApiProperty({ example: EUserType.User, enum: EUserType })
  userType: EUserType;

  @Expose()
  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt: string;

  @Expose()
  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  updatedAt: string;

  @Expose()
  @ApiProperty({ example: 'https://example.com/profile.jpg', nullable: true, required: false, description: 'URL of the profile photo' })
  profilePhotoUrl?: string;

  @Expose()
  @ApiProperty({ example: 'ABC Corporation', nullable: true, required: false, description: 'Business name' })
  businessName?: string;

  @Expose()
  @ApiProperty({ example: '123 Main Street, City, State, ZIP Code', nullable: true, required: false, description: 'Business address' })
  address?: string;

  @Expose()
  @ApiPropertyOptional({ example: '23AEVPJ0064L1ZA' })
  gstin?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'AEVPJ0064L' })
  pan?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'Madhya Pradesh' })
  state?: string;

  @Expose()
  @ApiPropertyOptional({ example: '23' })
  stateCode?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'Rajendra Jewellers' })
  proprietorName?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  shopLogoUrl?: string;

  @Expose()
  @ApiPropertyOptional({ example: '9827229924' })
  alternatePhoneNumber?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'UNION BANK OF INDIA' })
  bankName?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'KATRA BAZAR SAGAR (M.P)' })
  bankBranch?: string;

  @Expose()
  @ApiPropertyOptional({ example: '325405040053176' })
  bankAccountNumber?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'UBIN0532541' })
  bankIfsc?: string;

  @Expose()
  @ApiPropertyOptional({ example: true, description: 'Show bank details block on GST invoices' })
  showBankDetailsOnBill?: boolean;

  @Expose()
  @ApiProperty({
    example: false,
    description: 'Whether the user has not yet completed a first login (password, Google, or verify-email session).',
  })
  isFirstLogin?: boolean;
}
