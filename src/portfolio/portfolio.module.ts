import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PortfolioService } from './portfolio.service';
import { PortfolioController } from './portfolio.controller';
import { PriceAlertService } from './price-alert.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, PriceAlertService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
