import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SellInstructionStatus } from '@prisma/client';

export class UpdateSellInstructionAdminDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(SellInstructionStatus, { message: 'Invalid sell instruction status' })
  status: SellInstructionStatus;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}
