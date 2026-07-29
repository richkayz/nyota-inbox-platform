import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ListAuditDto {
  @IsOptional() @IsString() @MaxLength(128) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number = 100;
}

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() dto: ListAuditDto) {
    if (user.role !== 'COMPANY_ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Company admin role required');
    }
    return this.svc.list(user.tenantId, dto.limit ?? 100, dto.cursor ?? null);
  }
}
