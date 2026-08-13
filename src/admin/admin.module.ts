import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { RealEstateModule } from '../real-estate/real-estate.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PortfolioExecutionService } from './portfolio-execution.service';

@Module({
  imports: [ActivityLogModule, RealEstateModule, NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService, PortfolioExecutionService],
  exports: [AdminService],
})
export class AdminModule {}
