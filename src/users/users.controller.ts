import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { LogActivity } from '../common/decorators/log-activity.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser('userId') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @LogActivity({ action: 'PROFILE_UPDATED', entityType: 'User' })
  updateMe(@CurrentUser('userId') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(userId, dto);
  }

  @Post('me/devices')
  registerDevice(
    @CurrentUser('userId') userId: string,
    @Body('pushToken') pushToken: string,
    @Body('platform') platform?: string,
  ) {
    return this.usersService.registerDevice(userId, pushToken, platform);
  }
}
