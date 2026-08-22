import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RealEstateService } from './real-estate.service';
import { CreateRealEstateListingDto } from './dto/create-listing.dto';
import { UpdateRealEstateListingDto } from './dto/update-listing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RealEstateListingStatus } from '@prisma/client';

/** Public endpoint for mobile clients */
@Controller('real-estate')
export class RealEstateController {
  constructor(private realEstateService: RealEstateService) {}

  @Get('listings')
  listActiveListings() {
    return this.realEstateService.listActiveListings();
  }

  @Get('listings/:id')
  getListingById(@Param('id') id: string) {
    return this.realEstateService.getListingById(id);
  }
}

/** Admin-only endpoints */
@Controller('admin/real-estate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ADVISOR')
export class RealEstateAdminController {
  constructor(private realEstateService: RealEstateService) {}

  @Get('listings')
  listAllListings(@Query('status') status?: RealEstateListingStatus) {
    return this.realEstateService.listAllListings(status);
  }

  @Post('listings/upload')
  @Roles('ADMIN')
  uploadImage(@Body('imageDataUri') imageDataUri: string) {
    return this.realEstateService.uploadListingImage(imageDataUri);
  }

  @Post('listings')
  @Roles('ADMIN')
  createListing(@Body() dto: CreateRealEstateListingDto) {
    return this.realEstateService.createListing(dto);
  }

  @Patch('listings/:id')
  @Roles('ADMIN')
  updateListing(@Param('id') id: string, @Body() dto: UpdateRealEstateListingDto) {
    return this.realEstateService.updateListing(id, dto);
  }
}
