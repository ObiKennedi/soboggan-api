import { Module } from '@nestjs/common';
import { RealEstateService } from './real-estate.service';
import { RealEstateController, RealEstateAdminController } from './real-estate.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RealEstateController, RealEstateAdminController],
  providers: [RealEstateService],
  exports: [RealEstateService],
})
export class RealEstateModule {}
