import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LogActivityInput {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class ActivityLogService {
  constructor(private prisma: PrismaService) {}

  async log(input: LogActivityInput) {
    // Fire-and-forget from the caller's perspective; errors are swallowed
    // so a logging failure never breaks the actual user action.
    try {
      return await this.prisma.activityLog.create({
        data: input as Prisma.ActivityLogUncheckedCreateInput,
      });
    } catch (err) {
      console.error('[ActivityLog] failed to write log', err);
      return null;
    }
  }

  async listForUser(userId: string, take = 50, skip = 0) {
    return this.prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }
}
