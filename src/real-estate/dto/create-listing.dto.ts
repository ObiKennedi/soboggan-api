import {
  IsDecimal,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateRealEstateListingDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Location is required' })
  location: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber({}, { message: 'Price per unit must be a number' })
  @Min(1, { message: 'Price must be positive' })
  pricePerUnit: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  totalUnits?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
