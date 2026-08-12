import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CreateSellInstructionDto } from './dto/create-sell-instruction.dto';
import { CreateBuyInstructionDto } from './dto/create-buy-instruction.dto';

const FALLBACK_STOCKS = [
  { symbol: 'DANGCEM', name: 'Dangote Cement Plc', price: 650.00, change: 11.50, changePercent: '+1.80%', currency: 'NGN', volume: '1.2M' },
  { symbol: 'MTNN', name: 'MTN Nigeria Communications Plc', price: 220.50, change: 5.20, changePercent: '+2.41%', currency: 'NGN', volume: '3.4M' },
  { symbol: 'ZENITHBANK', name: 'Zenith Bank Plc', price: 38.20, change: 0.20, changePercent: '+0.53%', currency: 'NGN', volume: '8.9M' },
  { symbol: 'GTCO', name: 'Guaranty Trust Holding Co Plc', price: 45.00, change: 0.55, changePercent: '+1.24%', currency: 'NGN', volume: '5.1M' },
  { symbol: 'SEPLAT', name: 'Seplat Energy Plc', price: 3450.00, change: 104.00, changePercent: '+3.11%', currency: 'NGN', volume: '450K' },
  { symbol: 'ACCESSCORP', name: 'Access Holdings Plc', price: 22.80, change: -0.10, changePercent: '-0.44%', currency: 'NGN', volume: '12.3M' },
  { symbol: 'BUACEMENT', name: 'BUA Cement Plc', price: 145.00, change: 1.15, changePercent: '+0.80%', currency: 'NGN', volume: '890K' },
  { symbol: 'TOTAL', name: 'TotalEnergies Marketing Nigeria Plc', price: 385.00, change: 0.00, changePercent: '0.00%', currency: 'NGN', volume: '120K' },
  { symbol: 'AIRTELAFRI', name: 'Airtel Africa Plc', price: 2150.00, change: 86.70, changePercent: '+4.20%', currency: 'NGN', volume: '780K' },
  { symbol: 'NESTLE', name: 'Nestle Nigeria Plc', price: 900.00, change: -10.00, changePercent: '-1.10%', currency: 'NGN', volume: '210K' },
  { symbol: 'UBA', name: 'United Bank for Africa Plc', price: 26.50, change: 0.40, changePercent: '+1.53%', currency: 'NGN', volume: '14.5M' },
  { symbol: 'OANDO', name: 'Oando Plc', price: 75.00, change: 4.00, changePercent: '+5.63%', currency: 'NGN', volume: '6.7M' },
];

@Injectable()
export class InvestmentsService {
  constructor(
    private prisma: PrismaService,
    private activityLogService: ActivityLogService,
  ) {}

  async getAvailableStocks() {
    try {
      const apiKey = process.env.NGNMARKET_API_KEY;
      const apiUrl = process.env.NGNMARKET_API_URL || 'https://api.ngnmarket.com/v1/stocks';
      
      if (apiKey) {
        const response = await fetch(apiUrl, {
          headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) return data;
          if (data?.data && Array.isArray(data.data)) return data.data;
        }
      }
    } catch {
      // Graceful fallback to rich NGX dataset
    }
    return FALLBACK_STOCKS;
  }

  async createBuyInstruction(userId: string, dto: CreateBuyInstructionDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const totalCost = dto.unitPrice * dto.quantity;

    const instruction = await this.prisma.buyInstruction.create({
      data: {
        userId,
        stockSymbol: dto.stockSymbol.toUpperCase(),
        stockName: dto.stockName,
        unitPrice: dto.unitPrice,
        quantity: dto.quantity,
        totalCost,
        notes: dto.notes ?? null,
        status: 'PENDING',
      },
    });

    await this.activityLogService.log({
      userId,
      action: 'BUY_INSTRUCTION_SUBMITTED',
      entityType: 'BuyInstruction',
      entityId: instruction.id,
      ipAddress: ip,
      metadata: {
        stockSymbol: dto.stockSymbol,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        totalCost,
      },
    });

    return instruction;
  }

  async listBuyInstructions(userId: string) {
    return this.prisma.buyInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

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

    const buyInstructions = await this.prisma.buyInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    for (const inst of buyInstructions) {
      logs.push({
        id: `buy-${inst.id}`,
        type: 'BUY_INSTRUCTION',
        title: `Buy Instruction: ${inst.quantity} units of ${inst.stockSymbol}`,
        description: inst.notes || `Instruction to Admin to purchase ${inst.stockName} @ ₦${Number(inst.unitPrice).toLocaleString()}`,
        amount: Number(inst.totalCost),
        currency: 'NGN',
        timestamp: inst.createdAt,
        status: inst.status,
        meta: {
          stockSymbol: inst.stockSymbol,
          stockName: inst.stockName,
          quantity: inst.quantity,
          unitPrice: Number(inst.unitPrice),
          adminNotes: inst.adminNotes,
        },
      });
    }

    // Sort descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return logs;
  }
}
