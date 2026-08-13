import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { PusherService } from '../common/pusher/pusher.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private pusher: PusherService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.notificationsService.listForUser(
      userId,
      take ? parseInt(take, 10) : 30,
      skip ? parseInt(skip, 10) : 0,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  markAsRead(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.notificationsService.markAsRead(userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  markAllAsRead(@CurrentUser('userId') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('push-token')
  savePushToken(
    @CurrentUser('userId') userId: string,
    @Body('pushToken') pushToken: string,
    @Body('platform') platform?: string,
  ) {
    return this.notificationsService.savePushToken(userId, pushToken, platform);
  }

  /**
   * Pusher private-channel auth endpoint. The RN Pusher client calls this
   * automatically (via authEndpoint config) before subscribing to
   * `private-user-<userId>`.
   */
  @UseGuards(JwtAuthGuard)
  @Post('pusher/auth')
  authorizeChannel(
    @CurrentUser('userId') userId: string,
    @Body('socket_id') socketId: string,
    @Body('channel_name') channelName: string,
  ) {
    return this.pusher.authenticateChannel(socketId, channelName, userId);
  }
}
