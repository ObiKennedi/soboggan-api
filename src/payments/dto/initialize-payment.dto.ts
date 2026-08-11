import { IsNumber, IsPositive, IsString, IsUUID } from 'class-validator';

export class InitializePaymentDto {
  @IsUUID()
  accountId: string;

  @IsNumber()
  @IsPositive()
  amount: number; // in Naira, not kobo — the service converts
}
