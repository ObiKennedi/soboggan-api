import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const CRYPTO_COIN_PAIRS: Record<string, string> = {
  BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', BNB: 'BNB-USD',
  XRP: 'XRP-USD', ADA: 'ADA-USD', AVAX: 'AVAX-USD', DOGE: 'DOGE-USD',
  DOT: 'DOT-USD', MATIC: 'MATIC-USD', LINK: 'LINK-USD', LTC: 'LTC-USD',
  UNI: 'UNI-USD', SHIB: 'SHIB-USD', ATOM: 'ATOM-USD',
};
const USD_TO_NGN = parseFloat(process.env.USD_TO_NGN_RATE ?? '1600');
const ALERT_THRESHOLD_PCT = 2; // Alert when price moves ≥ 2% from averageCost

@Injectable()
export class PriceAlertService {
  private readonly logger = new Logger(PriceAlertService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  /** Runs every 2 hours */
  @Cron('0 */2 * * *')
  async checkPriceAlerts() {
    this.logger.log('Running price alert scan…');

    const holdings = await this.prisma.holding.findMany({
      where: { quantity: { gt: 0 } },
      include: {
        asset: true,
        portfolio: {
          include: {
            account: {
              include: {
                user: { select: { id: true, firstName: true } },
              },
            },
          },
        },
      },
    });

    // Also fetch executed buy instructions to determine asset category
    const cryptoSymbols = new Set<string>();
    const executedBuys = await this.prisma.buyInstruction.findMany({
      where: { status: 'EXECUTED', assetCategory: 'CRYPTO' },
      select: { stockSymbol: true },
    });
    for (const b of executedBuys) cryptoSymbols.add(b.stockSymbol.toUpperCase());

    for (const holding of holdings) {
      try {
        const symbol = holding.asset.symbol.toUpperCase();
        const averageCost = Number(holding.averageCost);
        if (averageCost <= 0) continue;

        let currentPrice = Number(holding.asset.currentPrice);

        // Override with live Coinbase price for crypto holdings
        if (cryptoSymbols.has(symbol)) {
          const pair = CRYPTO_COIN_PAIRS[symbol] ?? `${symbol}-USD`;
          const livePrice = await this.fetchCoinbasePrice(pair);
          if (livePrice) currentPrice = livePrice * USD_TO_NGN;
        }

        const changePct = ((currentPrice - averageCost) / averageCost) * 100;
        const absChange = Math.abs(changePct);

        if (absChange >= ALERT_THRESHOLD_PCT) {
          const userId = holding.portfolio.account.user.id;
          const firstName = holding.portfolio.account.user.firstName;
          const direction = changePct > 0 ? '📈 Up' : '📉 Down';
          const sign = changePct > 0 ? '+' : '';

          await this.notificationsService.create({
            userId,
            type: 'PORTFOLIO_UPDATE',
            title: `${symbol} is ${direction} ${sign}${changePct.toFixed(1)}%`,
            body: `${firstName}, your ${symbol} holding is now valued at ₦${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} vs your avg cost of ₦${averageCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
            metadata: {
              symbol,
              currentPrice,
              averageCost,
              changePct,
              holdingId: holding.id,
            },
          });

          this.logger.log(`Alerted ${userId} on ${symbol} (${sign}${changePct.toFixed(1)}%)`);
        }
      } catch (err) {
        this.logger.warn(`Price alert failed for holding ${holding.id}: ${err}`);
      }
    }
  }

  private async fetchCoinbasePrice(pair: string): Promise<number | null> {
    try {
      const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`);
      if (!res.ok) return null;
      const body = await res.json();
      const price = parseFloat(body?.data?.amount);
      return isNaN(price) ? null : price;
    } catch {
      return null;
    }
  }
}
