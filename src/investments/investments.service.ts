import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CreateSellInstructionDto } from './dto/create-sell-instruction.dto';

@Injectable()
export class InvestmentsService {
  constructor(
    private prisma: PrismaService,
    private activityLogService: ActivityLogService,
  ) {}

  async createSellInstruction(userId: string, dto: CreateSellInstructionDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const instruction = await this.prisma.sellInstruction.create({
      data: {
        userId,
        assetSymbol: dto.assetSymbol.toUpperCase(),
        assetName: dto.assetName,
        quantity: dto.quantity,
        targetPrice: dto.targetPrice ?? null,
        notes: dto.notes ?? null,
        status: 'PENDING',
      },
    });

    await this.activityLogService.log({
      userId,
      action: 'SELL_INSTRUCTION_SUBMITTED',
      entityType: 'SellInstruction',
      entityId: instruction.id,
      ipAddress: ip,
      metadata: {
        assetSymbol: dto.assetSymbol,
        quantity: dto.quantity,
        targetPrice: dto.targetPrice,
      },
    });

    return instruction;
  }

  async listSellInstructions(userId: string) {
    return this.prisma.sellInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOverview(userId: string) {
    // Get user's investment accounts & holdings
    const accounts = await this.prisma.account.findMany({
      where: { userId, type: 'INVESTMENT' },
      include: {
        portfolio: {
          include: {
            holdings: {
              include: { asset: true },
            },
          },
        },
      },
    });

    let totalValue = 0;
    let totalHoldingsCount = 0;
    const holdingsList: any[] = [];

    for (const acc of accounts) {
      if (acc.portfolio) {
        for (const h of acc.portfolio.holdings) {
          const val = Number(h.quantity) * Number(h.asset.currentPrice);
          const pnl = (Number(h.asset.currentPrice) - Number(h.averageCost)) * Number(h.quantity);
          totalValue += val;
          totalHoldingsCount++;
          holdingsList.push({
            id: h.id,
            symbol: h.asset.symbol,
            name: h.asset.name,
            assetType: h.asset.type,
            quantity: Number(h.quantity),
            averageCost: Number(h.averageCost),
            currentPrice: Number(h.asset.currentPrice),
            marketValue: val,
            unrealizedPnL: pnl,
          });
        }
      }
    }

    const activeInstructionsCount = await this.prisma.sellInstruction.count({
      where: { userId, status: { in: ['PENDING', 'IN_REVIEW'] } },
    });

    return {
      totalValue,
      totalHoldingsCount,
      activeInstructionsCount,
      holdings: holdingsList,
    };
  }

  async getInvestmentLogs(userId: string) {
    // 1. Get investment-related transactions (BUY, SELL, DIVIDEND, INTEREST)
    const userAccounts = await this.prisma.account.findMany({
      where: { userId },
      select: { id: true },
    });
    const accountIds = userAccounts.map((a) => a.id);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        accountId: { in: accountIds },
        type: { in: ['BUY', 'SELL', 'DIVIDEND', 'INTEREST'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // 2. Get user sell instructions
    const sellInstructions = await this.prisma.sellInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Map into unified log items sorted by timestamp
    const logs: any[] = [];

    for (const tx of transactions) {
      logs.push({
        id: `tx-${tx.id}`,
        type: 'TRANSACTION',
        title: `${tx.type} — ${tx.reference}`,
        description: tx.description || `${tx.type} transaction executed`,
        amount: Number(tx.amount),
        currency: tx.currency,
        timestamp: tx.createdAt,
        status: tx.status,
        meta: { txType: tx.type },
      });
    }

    for (const inst of sellInstructions) {
      logs.push({
        id: `inst-${inst.id}`,
        type: 'SELL_INSTRUCTION',
        title: `Sell Instruction: ${inst.quantity} units of ${inst.assetSymbol}`,
        description: inst.notes || `Instruction to Admin to liquidate ${inst.assetName}`,
        amount: inst.targetPrice ? Number(inst.targetPrice) * Number(inst.quantity) : null,
        currency: 'NGN',
        timestamp: inst.createdAt,
        status: inst.status,
        meta: {
          assetSymbol: inst.assetSymbol,
          assetName: inst.assetName,
          quantity: Number(inst.quantity),
          adminNotes: inst.adminNotes,
        },
      });
    }

    // Sort descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return logs;
  }
}
