import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { UpdateSellInstructionAdminDto } from './dto/update-sell-instruction-admin.dto';
import { UpdateBuyInstructionAdminDto } from './dto/update-buy-instruction-admin.dto';
import { Prisma, Role, KycStatus, SellInstructionStatus, BuyInstructionStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private activityLogService: ActivityLogService,
  ) {}

  async getStats() {
    const totalUsers = await this.prisma.user.count();
    const pendingKycUsers = await this.prisma.user.count({
      where: { kycStatus: { in: ['PENDING', 'IN_REVIEW'] } },
    });
    const pendingSellRequests = await this.prisma.sellInstruction.count({
      where: { status: { in: ['PENDING', 'IN_REVIEW'] } },
    });
    const pendingBuyRequests = await this.prisma.buyInstruction.count({
      where: { status: { in: ['PENDING', 'IN_REVIEW'] } },
    });
    const totalAccounts = await this.prisma.account.count();
    const totalTransactions = await this.prisma.transaction.count();

    // Compute institution total AUM (Sum of account balances)
    const accounts = await this.prisma.account.findMany({
      select: { balance: true },
    });

    const totalBalanceAum = accounts.reduce(
      (sum, acc) => sum + Number(acc.balance),
      0,
    );

    return {
      totalUsers,
      pendingKycUsers,
      pendingSellRequests,
      pendingBuyRequests,
      totalAccounts,
      totalTransactions,
      totalBalanceAum,
    };
  }

  async listUsers(q?: string, role?: Role, kycStatus?: KycStatus, skip = 0, take = 50) {
    const where: Prisma.UserWhereInput = {};

    if (role) where.role = role;
    if (kycStatus) where.kycStatus = kycStatus;
    if (q) {
      const searchTerm = q.trim();
      where.OR = [
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { lastName: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          accounts: {
            select: { id: true, type: true, balance: true, currency: true },
          },
          _count: {
            select: { sellInstructions: true, activityLogs: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const formatted = users.map((u) => {
      const totalUserBalance = u.accounts.reduce((sum, a) => sum + Number(a.balance), 0);
      return {
        ...u,
        totalBalance: totalUserBalance,
        accountsCount: u.accounts.length,
      };
    });

    return { data: formatted, total, skip, take };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          include: {
            portfolio: {
              include: { holdings: { include: { asset: true } } },
            },
          },
        },
        sellInstructions: { orderBy: { createdAt: 'desc' } },
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(userId: string, dto: UpdateUserAdminDto, adminUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.kycStatus !== undefined && { kycStatus: dto.kycStatus }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.activityLogService.log({
      userId: adminUserId,
      action: 'ADMIN_UPDATE_USER',
      entityType: 'User',
      entityId: userId,
      metadata: { changes: { ...dto }, targetEmail: user.email } as any,
    });

    return updated;
  }

  async listBuyInstructions(status?: BuyInstructionStatus) {
    const where: Prisma.BuyInstructionWhereInput = {};
    if (status) where.status = status;

    return this.prisma.buyInstruction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  async updateBuyInstruction(
    id: string,
    dto: UpdateBuyInstructionAdminDto,
    adminUserId: string,
  ) {
    const instruction = await this.prisma.buyInstruction.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!instruction) throw new NotFoundException('Buy instruction not found');

    const updated = await this.prisma.buyInstruction.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.adminNotes !== undefined && { adminNotes: dto.adminNotes }),
      },
    });

    await this.activityLogService.log({
      userId: adminUserId,
      action: 'ADMIN_UPDATE_BUY_INSTRUCTION',
      entityType: 'BuyInstruction',
      entityId: id,
      metadata: {
        stockSymbol: instruction.stockSymbol,
        newStatus: dto.status,
        clientEmail: instruction.user.email,
        adminNotes: dto.adminNotes,
      },
    });

    return updated;
  }

  async listSellInstructions(status?: SellInstructionStatus) {
    const where: Prisma.SellInstructionWhereInput = {};
    if (status) where.status = status;

    return this.prisma.sellInstruction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  async updateSellInstruction(
    id: string,
    dto: UpdateSellInstructionAdminDto,
    adminUserId: string,
  ) {
    const instruction = await this.prisma.sellInstruction.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!instruction) throw new NotFoundException('Sell instruction not found');

    const updated = await this.prisma.sellInstruction.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.adminNotes !== undefined && { adminNotes: dto.adminNotes }),
      },
    });

    await this.activityLogService.log({
      userId: adminUserId,
      action: 'ADMIN_UPDATE_SELL_INSTRUCTION',
      entityType: 'SellInstruction',
      entityId: id,
      metadata: {
        assetSymbol: instruction.assetSymbol,
        newStatus: dto.status,
        clientEmail: instruction.user.email,
        adminNotes: dto.adminNotes,
      },
    });

    return updated;
  }

  async listAccounts(q?: string, type?: string, status?: string) {
    const where: Prisma.AccountWhereInput = {};

    if (type) where.type = type as any;
    if (status) where.status = status as any;
    if (q) {
      const searchTerm = q.trim();
      where.OR = [
        { accountNumber: { contains: searchTerm, mode: 'insensitive' } },
        { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { firstName: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { lastName: { contains: searchTerm, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.account.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        portfolio: {
          select: { id: true, totalValue: true, holdings: { select: { id: true } } },
        },
        _count: { select: { transactions: true } },
      },
    });
  }

  async listActivityLogs(q?: string, action?: string, userId?: string, skip = 0, take = 100) {
    const where: Prisma.ActivityLogWhereInput = {};

    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (q) {
      const searchTerm = q.trim();
      where.OR = [
        { action: { contains: searchTerm, mode: 'insensitive' } },
        { entityType: { contains: searchTerm, mode: 'insensitive' } },
        { entityId: { contains: searchTerm, mode: 'insensitive' } },
        { ipAddress: { contains: searchTerm, mode: 'insensitive' } },
        { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { data: logs, total, skip, take };
  }
}
