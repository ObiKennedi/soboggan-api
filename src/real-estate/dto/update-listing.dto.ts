import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { RealEstateListingStatus } from '@prisma/client';

export class UpdateRealEstateListingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  pricePerUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  totalUnits?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsEnum(RealEstateListingStatus)
  status?: RealEstateListingStatus;
}
