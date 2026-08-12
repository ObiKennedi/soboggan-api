import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BuyInstructionStatus } from '@prisma/client';

export class UpdateBuyInstructionAdminDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(BuyInstructionStatus, { message: 'Invalid buy instruction status' })
  status: BuyInstructionStatus;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}
