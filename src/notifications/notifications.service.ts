import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PusherService } from '../common/pusher/pusher.service';
import axios from 'axios';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ExpoPushMessage {
  to: string | string[];
  sound?: 'default' | null;
  title?: string;
  body?: string;
  data?: any;
  badge?: number;
  channelId?: string;
}

export function isExpoPushToken(token: unknown): boolean {
  return (
    typeof token === 'string' &&
    (((token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) && token.endsWith(']')) ||
      /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(token))
  );
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

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
    if (!isExpoPushToken(pushToken)) {
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

  private chunkPushNotifications(messages: ExpoPushMessage[], chunkSize = 100): ExpoPushMessage[][] {
    const chunks: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }
    return chunks;
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
      .filter((t): t is string => !!t && isExpoPushToken(t));

    if (pushTokens.length === 0) return;

    const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));

    const chunks = this.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await axios.post('https://exp.host/--/api/v2/push/send', chunk, {
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
        });
      } catch (error: any) {
        this.logger.error('Error sending Expo push chunk:', error?.response?.data || error?.message || error);
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

  /**
   * Broadcasts a notification to all active clients (creates DB notifications and sends Expo Push notifications)
   */
  async broadcastToAllClients(input: {
    title: string;
    body: string;
    type?: NotificationType;
    metadata?: Prisma.InputJsonValue;
  }) {
    const type = input.type || NotificationType.MARKETING;
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    if (users.length === 0) return;

    // 1. Bulk create DB notifications
    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        title: input.title,
        body: input.body,
        metadata: input.metadata || {},
      })),
    });

    // 2. Query all devices with push tokens
    const devices = await this.prisma.device.findMany({
      where: { pushToken: { not: null } },
      select: { pushToken: true },
    });

    const pushTokens = Array.from(
      new Set(
        devices
          .map((d) => d.pushToken)
          .filter((t): t is string => !!t && isExpoPushToken(t)),
      ),
    );

    if (pushTokens.length > 0) {
      const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: input.title,
        body: input.body,
        data: input.metadata || {},
      }));

      const chunks = this.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await axios.post('https://exp.host/--/api/v2/push/send', chunk, {
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
          });
        } catch (error: any) {
          this.logger.error('Error broadcasting Expo push chunk:', error?.response?.data || error?.message || error);
        }
      }
    }
  }
}
