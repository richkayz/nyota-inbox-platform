import { SetMetadata } from '@nestjs/common';

export type AppRole = 'USER' | 'COMPANY_ADMIN' | 'SUPER_ADMIN';

export const ROLES_KEY = 'nyota:roles';

/** Server-side authorization. Frontend redirects are UX only. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
