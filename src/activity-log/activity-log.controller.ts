import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ActivityLogService } from './activity-log.service';

@UseGuards(JwtAuthGuard)
@Controller('activity-logs')
export class ActivityLogController {
  constructor(private activityLogService: ActivityLogService) {}

  @Get()
  async list(
    @CurrentUser('userId') userId: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.activityLogService.listForUser(
      userId,
      take ? parseInt(take, 10) : 50,
      skip ? parseInt(skip, 10) : 0,
    );
  }
}
