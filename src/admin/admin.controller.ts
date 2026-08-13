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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { UpdateSellInstructionAdminDto } from './dto/update-sell-instruction-admin.dto';
import { UpdateBuyInstructionAdminDto } from './dto/update-buy-instruction-admin.dto';
import { Role, KycStatus, SellInstructionStatus, BuyInstructionStatus, RealEstateListingStatus } from '@prisma/client';
import { RealEstateService } from '../real-estate/real-estate.service';
import { CreateRealEstateListingDto } from '../real-estate/dto/create-listing.dto';
import { UpdateRealEstateListingDto } from '../real-estate/dto/update-listing.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ADVISOR')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private realEstateService: RealEstateService,
  ) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  listUsers(
    @Query('q') q?: string,
    @Query('role') role?: Role,
    @Query('kycStatus') kycStatus?: KycStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.adminService.listUsers(
      q,
      role,
      kycStatus,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id')
  @Roles('ADMIN')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserAdminDto,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.adminService.updateUser(id, dto, adminUserId);
  }

  @Get('buy-instructions')
  listBuyInstructions(@Query('status') status?: BuyInstructionStatus) {
    return this.adminService.listBuyInstructions(status);
  }

  @Patch('buy-instructions/:id')
  updateBuyInstruction(
    @Param('id') id: string,
    @Body() dto: UpdateBuyInstructionAdminDto,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.adminService.updateBuyInstruction(id, dto, adminUserId);
  }

  @Get('sell-instructions')
  listSellInstructions(@Query('status') status?: SellInstructionStatus) {
    return this.adminService.listSellInstructions(status);
  }

  @Patch('sell-instructions/:id')
  updateSellInstruction(
    @Param('id') id: string,
    @Body() dto: UpdateSellInstructionAdminDto,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.adminService.updateSellInstruction(id, dto, adminUserId);
  }

  @Get('accounts')
  listAccounts(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listAccounts(q, type, status);
  }

  @Get('activity-logs')
  listActivityLogs(
    @Query('q') q?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.adminService.listActivityLogs(
      q,
      action,
      userId,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 100,
    );
  }

  // ─── Real Estate Listings ───────────────────────────────────────────────

  @Get('real-estate/listings')
  listRealEstateListings(@Query('status') status?: RealEstateListingStatus) {
    return this.realEstateService.listAllListings(status);
  }

  @Post('real-estate/listings')
  @Roles('ADMIN')
  createRealEstateListing(@Body() dto: CreateRealEstateListingDto) {
    return this.realEstateService.createListing(dto);
  }

  @Patch('real-estate/listings/:id')
  @Roles('ADMIN')
  updateRealEstateListing(
    @Param('id') id: string,
    @Body() dto: UpdateRealEstateListingDto,
  ) {
    return this.realEstateService.updateListing(id, dto);
  }
}
