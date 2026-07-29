import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ContactsService } from './contacts.service';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ListDto {
  @IsOptional() @IsString() @MaxLength(128) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number = 50;
  @IsOptional() @IsString() @MaxLength(255) q?: string;
}

class UpsertDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsBoolean() starred?: boolean;
}

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('contacts')
export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ListDto) {
    return this.svc.list(user.userId, dto.limit ?? 50, dto.cursor ?? null, dto.q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertDto) {
    return this.svc.create(user.userId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }
}
