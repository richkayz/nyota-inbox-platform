import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cursor-based list. Cursor is the last contact id from the previous page. */
  async list(userId: string, limit: number, cursor: string | null, q?: string) {
    const items = await this.prisma.contact.findMany({
      where: {
        userId,
        ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {}),
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ starred: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
    const nextCursor = items.length > limit ? items[limit].id : null;
    return { items: items.slice(0, limit), nextCursor };
  }

  create(userId: string, data: { email: string; name?: string; starred?: boolean }) {
    return this.prisma.contact.upsert({
      where: { userId_email: { userId, email: data.email } },
      update: { name: data.name, starred: data.starred },
      create: { userId, email: data.email, name: data.name, starred: data.starred ?? false },
    });
  }

  remove(userId: string, id: string) {
    return this.prisma.contact.deleteMany({ where: { id, userId } });
  }
}
