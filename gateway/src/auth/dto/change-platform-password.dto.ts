import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePlatformPasswordDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(512)
  newPassword!: string;
}
