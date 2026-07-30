import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { TenantAdminController } from './tenant-admin.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [SuperAdminController, TenantAdminController],
})
export class AdminModule {}
