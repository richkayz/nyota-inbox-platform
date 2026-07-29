import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ListMessagesDto {
  @IsString()
  @MaxLength(255)
  folder!: string;

  /** Opaque cursor from the previous page. Omit for the first page. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  /** Optional IMAP SEARCH string (e.g. `SUBJECT "invoice"`). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;
}
