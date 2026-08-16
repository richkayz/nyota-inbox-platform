import { Module } from '@nestjs/common';
import { PleskController } from './plesk.controller';
import { PleskService } from './plesk.service';

@Module({
  controllers: [PleskController],
  providers: [PleskService],
  exports: [PleskService],
})
export class PleskModule {}
