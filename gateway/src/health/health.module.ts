import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthModule } from '../auth/auth.module';
import { ImapModule } from '../imap/imap.module';
import { SmtpModule } from '../smtp/smtp.module';

@Module({
  imports: [AuthModule, ImapModule, SmtpModule],
  controllers: [HealthController],
})
export class HealthModule {}
