ALTER TABLE `TenantDomain`
ADD COLUMN `pleskDomainId` INTEGER NULL;

CREATE INDEX `TenantDomain_pleskDomainId_idx`
ON `TenantDomain`(`pleskDomainId`);
