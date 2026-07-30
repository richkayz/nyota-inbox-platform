import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, digits or dashes' })
  slug!: string;

  @IsString() @MaxLength(160) name!: string;

  @IsString() @MaxLength(255) hostname!: string;

  @IsArray() @IsString({ each: true }) allowedDomains!: string[];

  @IsOptional() @IsString() @MaxLength(32) plan?: string;
  @IsOptional() @IsString() @MaxLength(32) status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) mailboxLimit?: number;
  @IsOptional() @IsString() @MaxLength(64) mailServerId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) extraDomains?: string[];

  @IsOptional() branding?: Record<string, unknown>;

  /** Mailbox address promoted to COMPANY_ADMIN on first sign-in. */
  @IsOptional() @IsString() @MaxLength(320) adminEmail?: string;
}

export class UpdateTenantStatusDto {
  @IsString() @MaxLength(32) status!: string;
}

export class UpdateBrandingDto {
  @IsOptional() @IsString() @MaxLength(64) primary?: string;
  @IsOptional() @IsString() @MaxLength(64) accent?: string;
  @IsOptional() @IsString() @MaxLength(512) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(512) faviconUrl?: string;
  @IsOptional() @IsString() @MaxLength(280) welcomeMessage?: string;
  @IsOptional() @IsString() @MaxLength(320) supportEmail?: string;
}

export class CreateMailServerDto {
  @IsString() @MaxLength(64) name!: string;
  @IsString() @MaxLength(255) hostname!: string;
  @IsOptional() @IsString() @MaxLength(64) region?: string;
  @IsOptional() @IsString() @MaxLength(255) imapHost?: string;
  @IsOptional() @IsInt() imapPort?: number;
  @IsOptional() @IsBoolean() imapSecure?: boolean;
  @IsOptional() @IsString() @MaxLength(255) imapTlsServername?: string;
  @IsOptional() @IsString() @MaxLength(255) smtpHost?: string;
  @IsOptional() @IsInt() smtpPort?: number;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @IsOptional() @IsString() @MaxLength(255) smtpTlsServername?: string;
}
