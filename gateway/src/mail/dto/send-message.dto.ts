import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AttachmentDto {
  @IsString()
  @MaxLength(255)
  filename!: string;

  /** base64-encoded content */
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contentType?: string;
}

export class SendMessageDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsString()
  @MaxLength(998)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  html?: string;

  @IsOptional()
  @IsString()
  @MaxLength(998)
  inReplyTo?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  references?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
