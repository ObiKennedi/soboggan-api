import { Module } from '@nestjs/common';
import { RealEstateService } from './real-estate.service';
import { RealEstateController, RealEstateAdminController } from './real-estate.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [RealEstateController, RealEstateAdminController],
  providers: [RealEstateService],
  exports: [RealEstateService],
})
export class RealEstateModule {}
