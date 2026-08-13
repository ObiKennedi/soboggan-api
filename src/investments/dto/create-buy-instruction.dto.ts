import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { AssetCategory } from '@prisma/client';

export class CreateBuyInstructionDto {
  @IsEnum(AssetCategory)
  assetCategory: AssetCategory;

  @IsString()
  @IsNotEmpty({ message: 'Asset symbol is required' })
  stockSymbol: string;

  @IsString()
  @IsNotEmpty({ message: 'Asset name is required' })
  stockName: string;

  @IsNumber({}, { message: 'Unit price must be a valid number' })
  @Min(0.000001, { message: 'Unit price must be positive' })
  unitPrice: number;

  @IsNumber({}, { message: 'Quantity must be a valid number' })
  @Min(0.000001, { message: 'Quantity must be positive' })
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /** For REAL_ESTATE: link to the RealEstateListing being purchased */
  @IsOptional()
  @IsUUID()
  listingId?: string;
}
