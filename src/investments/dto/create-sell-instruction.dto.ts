import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSellInstructionDto {
  @IsString()
  @IsNotEmpty({ message: 'Asset symbol is required' })
  assetSymbol: string;

  @IsString()
  @IsNotEmpty({ message: 'Asset name is required' })
  assetName: string;

  @IsNumber({}, { message: 'Quantity must be a valid number' })
  @Min(0.000001, { message: 'Quantity must be greater than 0' })
  quantity: number;

  @IsOptional()
  @IsNumber({}, { message: 'Target price must be a valid number' })
  targetPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
