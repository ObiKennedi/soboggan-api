import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PusherService } from '../common/pusher/pusher.service';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private pusher: PusherService,
  ) {}

  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: input as Prisma.NotificationUncheckedCreateInput,
    });

    // Push it live to any connected device; the RN app subscribes to
    // `private-user-<userId>` and listens for the `notification` event.
    await this.pusher.triggerToUser(input.userId, 'notification', notification);

    return notification;
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
    // updateMany scoped by userId so a user can never mark someone else's
    // notification as read by guessing an id.
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
