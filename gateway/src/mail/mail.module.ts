import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { ImapModule } from '../imap/imap.module';
import { SmtpModule } from '../smtp/smtp.module';

@Module({
  imports: [ImapModule, SmtpModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
