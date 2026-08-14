import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PusherService } from '../common/pusher/pusher.service';
import { CreateSellInstructionDto } from './dto/create-sell-instruction.dto';
import { CreateBuyInstructionDto } from './dto/create-buy-instruction.dto';
import { NotificationType, Role } from '@prisma/client';

// ─── Fallback NGX Stock Data ────────────────────────────────────────────────


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

// ─── Curated Crypto List ─────────────────────────────────────────────────────

const CRYPTO_COINS = [
  { symbol: 'BTC', name: 'Bitcoin', pair: 'BTC-USD' },
  { symbol: 'ETH', name: 'Ethereum', pair: 'ETH-USD' },
  { symbol: 'SOL', name: 'Solana', pair: 'SOL-USD' },
  { symbol: 'BNB', name: 'BNB', pair: 'BNB-USD' },
  { symbol: 'XRP', name: 'XRP', pair: 'XRP-USD' },
  { symbol: 'ADA', name: 'Cardano', pair: 'ADA-USD' },
  { symbol: 'AVAX', name: 'Avalanche', pair: 'AVAX-USD' },
  { symbol: 'DOGE', name: 'Dogecoin', pair: 'DOGE-USD' },
  { symbol: 'DOT', name: 'Polkadot', pair: 'DOT-USD' },
  { symbol: 'MATIC', name: 'Polygon', pair: 'MATIC-USD' },
  { symbol: 'LINK', name: 'Chainlink', pair: 'LINK-USD' },
  { symbol: 'LTC', name: 'Litecoin', pair: 'LTC-USD' },
  { symbol: 'UNI', name: 'Uniswap', pair: 'UNI-USD' },
  { symbol: 'SHIB', name: 'Shiba Inu', pair: 'SHIB-USD' },
  { symbol: 'ATOM', name: 'Cosmos', pair: 'ATOM-USD' },
];

// Fallback prices in case Coinbase is unreachable
const CRYPTO_FALLBACK: Record<string, number> = {
  BTC: 105000, ETH: 3800, SOL: 190, BNB: 700, XRP: 0.65,
  ADA: 0.48, AVAX: 38, DOGE: 0.16, DOT: 7.8, MATIC: 0.55,
  LINK: 20, LTC: 95, UNI: 10, SHIB: 0.000025, ATOM: 9.5,
};

// ─── Cache for Coinbase prices ───────────────────────────────────────────────

interface CachedPrice { price: number; fetchedAt: number }
const cryptoPriceCache = new Map<string, CachedPrice>();
const CACHE_TTL_MS = 60_000; // 60 seconds

@Injectable()
export class InvestmentsService {
  constructor(
    private prisma: PrismaService,
    private activityLogService: ActivityLogService,
    private notificationsService: NotificationsService,
    private pusherService: PusherService,
  ) {}

  // ─── Stocks ─────────────────────────────────────────────────────────────

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
      // Graceful fallback
    }
    return FALLBACK_STOCKS;
  }

  // ─── Crypto ──────────────────────────────────────────────────────────────

  /** Fetch a single coin price from Coinbase (with in-memory cache) */
  private async getCoinbasePrice(pair: string): Promise<number | null> {
    const cached = cryptoPriceCache.get(pair);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.price;
    }
    try {
      const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) return null;
      const body = await res.json();
      const price = parseFloat(body?.data?.amount);
      if (!isNaN(price) && price > 0) {
        cryptoPriceCache.set(pair, { price, fetchedAt: Date.now() });
        return price;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /** Returns the full crypto list with live USD prices from Coinbase */
  async getAvailableCrypto() {
    const usdToNgn = parseFloat(process.env.USD_TO_NGN_RATE ?? '1600');

    const results = await Promise.all(
      CRYPTO_COINS.map(async (coin) => {
        const livePrice = await this.getCoinbasePrice(coin.pair);
        const priceUSD = livePrice ?? CRYPTO_FALLBACK[coin.symbol] ?? 0;
        const priceNGN = priceUSD * usdToNgn;
        return {
          symbol: coin.symbol,
          name: coin.name,
          pair: coin.pair,
          priceUSD,
          priceNGN,
          currency: 'USD',
          isLive: livePrice !== null,
        };
      }),
    );
    return results;
  }

  // ─── Buy Instructions ────────────────────────────────────────────────────

  async createBuyInstruction(userId: string, dto: CreateBuyInstructionDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const totalCost = dto.unitPrice * dto.quantity;

    const instruction = await this.prisma.buyInstruction.create({
      data: {
        userId,
        assetCategory: dto.assetCategory,
        stockSymbol: dto.stockSymbol.toUpperCase(),
        stockName: dto.stockName,
        unitPrice: dto.unitPrice,
        quantity: dto.quantity,
        totalCost,
        notes: dto.notes ?? null,
        status: 'PENDING',
        listingId: dto.listingId ?? null,
      },
    });

    await this.activityLogService.log({
      userId,
      action: 'BUY_INSTRUCTION_SUBMITTED',
      entityType: 'BuyInstruction',
      entityId: instruction.id,
      ipAddress: ip,
      metadata: {
        assetCategory: dto.assetCategory,
        stockSymbol: dto.stockSymbol,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        totalCost,
      },
    });

    // Notify all active admins & advisors
    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.ADVISOR] },
        isActive: true,
      },
      select: { id: true, email: true },
    });

    const clientDisplayName = `${user.firstName} ${user.lastName}`.trim() || user.email;

    for (const admin of admins) {
      await this.notificationsService.create({
        userId: admin.id,
        type: NotificationType.PORTFOLIO_UPDATE,
        title: `📥 New Buy Request: ${dto.stockSymbol.toUpperCase()}`,
        body: `${clientDisplayName} submitted a request to buy ${dto.quantity} units of ${dto.stockName}.`,
        metadata: {
          type: 'BUY_INSTRUCTION',
          instructionId: instruction.id,
          assetCategory: dto.assetCategory,
          stockSymbol: dto.stockSymbol.toUpperCase(),
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          totalCost,
          clientEmail: user.email,
          clientName: clientDisplayName,
        },
      });

      await this.pusherService.triggerToUser(admin.id, 'buy_instruction_created', {
        instruction,
        client: {
          id: user.id,
          email: user.email,
          name: clientDisplayName,
          phone: user.phone,
        },
      });
    }

    return instruction;
  }

  async listBuyInstructions(userId: string) {
    return this.prisma.buyInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { listing: true },
    });
  }

  // ─── Sell Instructions ───────────────────────────────────────────────────

  async createSellInstruction(userId: string, dto: CreateSellInstructionDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Verify client holding ownership and quantity
    const userAccounts = await this.prisma.account.findMany({
      where: { userId },
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

    let totalOwnedUnits = 0;
    for (const acc of userAccounts) {
      if (acc.portfolio) {
        for (const h of acc.portfolio.holdings) {
          if (h.asset.symbol.toUpperCase() === dto.assetSymbol.toUpperCase()) {
            totalOwnedUnits += Number(h.quantity);
          }
        }
      }
    }

    if (totalOwnedUnits <= 0) {
      throw new BadRequestException(
        `You do not own any units of ${dto.assetSymbol.toUpperCase()} to sell.`,
      );
    }

    if (totalOwnedUnits < Number(dto.quantity)) {
      throw new BadRequestException(
        `You only own ${totalOwnedUnits} unit(s) of ${dto.assetSymbol.toUpperCase()}, which is less than the requested ${dto.quantity} unit(s).`,
      );
    }

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

    // Notify all active admins & advisors
    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.ADVISOR] },
        isActive: true,
      },
      select: { id: true, email: true },
    });

    const clientDisplayName = `${user.firstName} ${user.lastName}`.trim() || user.email;

    for (const admin of admins) {
      await this.notificationsService.create({
        userId: admin.id,
        type: NotificationType.PORTFOLIO_UPDATE,
        title: `🚨 New Sell Instruction: ${dto.assetSymbol.toUpperCase()}`,
        body: `${clientDisplayName} submitted an instruction to sell ${dto.quantity} units of ${dto.assetName || dto.assetSymbol}.`,
        metadata: {
          type: 'SELL_INSTRUCTION',
          instructionId: instruction.id,
          assetSymbol: dto.assetSymbol.toUpperCase(),
          quantity: dto.quantity,
          targetPrice: dto.targetPrice ?? null,
          clientEmail: user.email,
          clientName: clientDisplayName,
        },
      });

      await this.pusherService.triggerToUser(admin.id, 'sell_instruction_created', {
        instruction,
        client: {
          id: user.id,
          email: user.email,
          name: clientDisplayName,
          phone: user.phone,
        },
      });
    }

    return instruction;
  }

  async listSellInstructions(userId: string) {
    return this.prisma.sellInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Portfolio Overview (live-valued) ────────────────────────────────────

  async getOverview(userId: string) {
    const usdToNgn = parseFloat(process.env.USD_TO_NGN_RATE ?? '1600');

    const accounts = await this.prisma.account.findMany({
      where: { userId, type: 'INVESTMENT' },
      include: {
        portfolio: {
          include: {
            holdings: { include: { asset: true } },
          },
        },
      },
    });

    // Build a map of executed buy instructions so we know which are crypto/real-estate
    const executedBuys = await this.prisma.buyInstruction.findMany({
      where: { userId, status: 'EXECUTED' },
      include: { listing: true },
    });
    const buyBySymbol = new Map<string, typeof executedBuys[0]>();
    for (const b of executedBuys) {
      buyBySymbol.set(b.stockSymbol.toUpperCase(), b);
    }

    let totalValue = 0;
    let totalHoldingsCount = 0;
    const holdingsList: any[] = [];

    for (const acc of accounts) {
      if (!acc.portfolio) continue;
      for (const h of acc.portfolio.holdings) {
        const symbol = h.asset.symbol.toUpperCase();
        const matchedBuy = buyBySymbol.get(symbol);
        const assetCategory = matchedBuy?.assetCategory ?? 'STOCK';

        let currentPrice = Number(h.asset.currentPrice);
        let priceUSD: number | undefined;
        let isLivePrice = false;

        if (assetCategory === 'CRYPTO') {
          // Find Coinbase pair
          const coin = CRYPTO_COINS.find((c) => c.symbol === symbol);
          const pair = coin?.pair ?? `${symbol}-USD`;
          const liveUSD = await this.getCoinbasePrice(pair);
          priceUSD = liveUSD ?? CRYPTO_FALLBACK[symbol] ?? currentPrice;
          currentPrice = priceUSD * usdToNgn;
          isLivePrice = liveUSD !== null;
        } else if (assetCategory === 'REAL_ESTATE' && matchedBuy?.listing) {
          currentPrice = Number(matchedBuy.listing.pricePerUnit);
        }

        const qty = Number(h.quantity);
        const val = qty * currentPrice;
        const pnl = (currentPrice - Number(h.averageCost)) * qty;

        totalValue += val;
        totalHoldingsCount++;
        holdingsList.push({
          id: h.id,
          symbol: h.asset.symbol,
          name: h.asset.name,
          assetType: h.asset.type,
          assetCategory,
          quantity: qty,
          averageCost: Number(h.averageCost),
          currentPrice,
          priceUSD: priceUSD ?? null,
          isLivePrice,
          marketValue: val,
          unrealizedPnL: pnl,
          listingId: matchedBuy?.listingId ?? null,
        });
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

  // ─── Investment Logs ─────────────────────────────────────────────────────

  async getInvestmentLogs(userId: string) {
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

    const sellInstructions = await this.prisma.sellInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const buyInstructions = await this.prisma.buyInstruction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { listing: true },
    });

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

    for (const inst of buyInstructions) {
      const categoryLabel =
        inst.assetCategory === 'CRYPTO' ? '🪙 Crypto' :
        inst.assetCategory === 'REAL_ESTATE' ? '🏠 Real Estate' : '📈 Stock';

      logs.push({
        id: `buy-${inst.id}`,
        type: 'BUY_INSTRUCTION',
        title: `${categoryLabel} Buy: ${inst.quantity} × ${inst.stockSymbol}`,
        description: inst.notes || `Instruction to Admin to purchase ${inst.stockName}`,
        amount: Number(inst.totalCost),
        currency: 'NGN',
        timestamp: inst.createdAt,
        status: inst.status,
        meta: {
          assetCategory: inst.assetCategory,
          stockSymbol: inst.stockSymbol,
          stockName: inst.stockName,
          quantity: Number(inst.quantity),
          unitPrice: Number(inst.unitPrice),
          adminNotes: inst.adminNotes,
          listingId: inst.listingId,
        },
      });
    }

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return logs;
  }
}
