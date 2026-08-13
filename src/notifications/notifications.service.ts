import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PusherService } from '../common/pusher/pusher.service';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expo = new Expo();

  constructor(
    private prisma: PrismaService,
    private pusher: PusherService,
  ) {}

  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: input as Prisma.NotificationUncheckedCreateInput,
    });

    // 1. Trigger Pusher websocket notification
    await this.pusher.triggerToUser(input.userId, 'notification', notification);

    // 2. Trigger Expo Push notification if user has registered device push tokens
    this.sendExpoPush(input.userId, input.title, input.body, input.metadata).catch((err) => {
      this.logger.warn(`Failed to send push notification to user ${input.userId}: ${err.message}`);
    });

    return notification;
  }

  async savePushToken(userId: string, pushToken: string, platform?: string) {
    if (!Expo.isExpoPushToken(pushToken)) {
      this.logger.warn(`Invalid Expo push token format: ${pushToken}`);
    }

    // Upsert or create device token for user
    const existingDevice = await this.prisma.device.findFirst({
      where: { userId, pushToken },
    });

    if (existingDevice) {
      return this.prisma.device.update({
        where: { id: existingDevice.id },
        data: { lastSeenAt: new Date(), platform: platform || existingDevice.platform },
      });
    }

    return this.prisma.device.create({
      data: {
        userId,
        pushToken,
        platform,
      },
    });
  }

  private async sendExpoPush(
    userId: string,
    title: string,
    body: string,
    data?: any,
  ) {
    const devices = await this.prisma.device.findMany({
      where: { userId, pushToken: { not: null } },
      select: { pushToken: true },
    });

    const pushTokens = devices
      .map((d) => d.pushToken)
      .filter((t): t is string => !!t && Expo.isExpoPushToken(t));

    if (pushTokens.length === 0) return;

    const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        this.logger.error('Error sending Expo push chunk:', error);
      }
    }
  }

  async listForUser(userId: string, take = 30, skip = 0) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
    return this.prisma.notification.findUnique({ where: { id: notificationId } });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}
