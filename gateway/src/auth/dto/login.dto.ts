import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string;
}
