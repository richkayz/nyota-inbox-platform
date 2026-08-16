import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { TenantAdminController } from './tenant-admin.controller';
import { AuditModule } from '../audit/audit.module';
import { PleskModule } from '../plesk/plesk.module';

@Module({
  imports: [AuditModule, PleskModule],
  controllers: [SuperAdminController, TenantAdminController],
})
export class AdminModule {}
