import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string) {
    return (
      (await this.prisma.preference.findUnique({ where: { userId } })) ??
      (await this.prisma.preference.create({ data: { userId } }))
    );
  }

  updatePreferences(userId: string, patch: { theme?: string; density?: string; locale?: string; timezone?: string; data?: any }) {
    return this.prisma.preference.upsert({
      where: { userId },
      update: patch,
      create: { userId, ...patch },
    });
  }

  async getNotifications(userId: string) {
    return (
      (await this.prisma.notificationSetting.findUnique({ where: { userId } })) ??
      (await this.prisma.notificationSetting.create({ data: { userId } }))
    );
  }

  updateNotifications(userId: string, patch: { desktopEnabled?: boolean; soundEnabled?: boolean; digestEnabled?: boolean; digestHourUtc?: number }) {
    return this.prisma.notificationSetting.upsert({
      where: { userId },
      update: patch,
      create: { userId, ...patch },
    });
  }

  listSignatures(userId: string) {
    return this.prisma.signature.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  upsertSignature(userId: string, data: { id?: string; name: string; html: string; isDefault?: boolean }) {
    if (data.isDefault) {
      // best-effort: unset others
      return this.prisma.$transaction(async (tx) => {
        await tx.signature.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
        return data.id
          ? tx.signature.update({ where: { id: data.id }, data: { name: data.name, html: data.html, isDefault: true } })
          : tx.signature.create({ data: { userId, name: data.name, html: data.html, isDefault: true } });
      });
    }
    return data.id
      ? this.prisma.signature.update({ where: { id: data.id }, data })
      : this.prisma.signature.create({ data: { userId, ...data } });
  }

  removeSignature(userId: string, id: string) {
    return this.prisma.signature.deleteMany({ where: { id, userId } });
  }
}
