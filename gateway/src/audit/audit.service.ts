import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  userId?: string;
  tenantId: string;
  type: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append-only, hash-chained per tenant. */
  async record(input: AuditInput) {
    const prev = await this.prisma.auditLog.findFirst({
      where: { tenantId: input.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const payload = JSON.stringify({ ...input, prevHash: prev?.hash ?? null, ts: Date.now() });
    const hash = createHash('sha256').update(payload).digest('hex');
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        type: input.type,
        email: input.email,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: (input.meta ?? {}) as any,
        prevHash: prev?.hash ?? null,
        hash,
      },
    });
  }

  list(tenantId: string, limit: number, cursor: string | null) {
    return this.prisma.auditLog
      .findMany({
        where: { tenantId },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      })
      .then((items) => ({
        items: items.slice(0, limit),
        nextCursor: items.length > limit ? items[limit].id : null,
      }));
  }
}
