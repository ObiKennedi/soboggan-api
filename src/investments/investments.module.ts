import { Module } from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { InvestmentsController } from './investments.controller';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { RealEstateModule } from '../real-estate/real-estate.module';

@Module({
  imports: [ActivityLogModule, RealEstateModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
