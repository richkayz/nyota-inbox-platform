import { Global, Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';

/**
 * Tenant resolution is needed by auth, mail transports and both admin
 * consoles, so it is global to avoid circular module imports.
 */
@Global()
@Module({
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
