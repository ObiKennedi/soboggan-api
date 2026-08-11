import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

export class ApplyForLoanDto {
  @IsNumber()
  @IsPositive()
  principal: number;

  @IsInt()
  @Min(1)
  @Max(60)
  tenureMonths: number;

  @IsOptional()
  @IsString()
  purpose?: string;
}

export class RepayLoanDto {
  @IsNumber()
  @IsPositive()
  amount: number;
}
