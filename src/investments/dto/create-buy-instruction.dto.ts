import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBuyInstructionDto {
  @IsString()
  @IsNotEmpty({ message: 'Stock symbol is required' })
  stockSymbol: string;

  @IsString()
  @IsNotEmpty({ message: 'Stock name is required' })
  stockName: string;

  @IsNumber({}, { message: 'Unit price must be a valid number' })
  @Min(0.01, { message: 'Unit price must be positive' })
  unitPrice: number;

  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
