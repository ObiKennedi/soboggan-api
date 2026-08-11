import { IsString, IsNotEmpty } from 'class-validator';

export class GoogleMobileLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken: string; // ID token from the RN Google Sign-In SDK
}
