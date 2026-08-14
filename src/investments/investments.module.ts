import { Module } from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { InvestmentsController } from './investments.controller';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { RealEstateModule } from '../real-estate/real-estate.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PusherModule } from '../common/pusher/pusher.module';

@Module({
  imports: [ActivityLogModule, RealEstateModule, NotificationsModule, PusherModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}

