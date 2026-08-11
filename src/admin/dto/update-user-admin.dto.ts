import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role, KycStatus } from '@prisma/client';

export class UpdateUserAdminDto {
  @IsOptional()
  @IsEnum(Role, { message: 'Invalid role' })
  role?: Role;

  @IsOptional()
  @IsEnum(KycStatus, { message: 'Invalid KYC status' })
  kycStatus?: KycStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
