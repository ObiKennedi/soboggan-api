import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortfolioService {
  constructor(private prisma: PrismaService) {}

  async getForAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.userId !== userId) throw new ForbiddenException();

    const portfolio = await this.prisma.portfolio.findUnique({
      where: { accountId },
      include: { holdings: { include: { asset: true } } },
    });
    if (!portfolio) throw new NotFoundException('This account has no portfolio');

    return this.withComputedValues(portfolio);
  }

  async listAssets() {
    return this.prisma.asset.findMany({ orderBy: { symbol: 'asc' } });
  }

  /** Recomputes portfolio.totalValue from current holding market values and persists it. */
  private withComputedValues(portfolio: any) {
    const holdingsWithValue = portfolio.holdings.map((h: any) => ({
      ...h,
      marketValue: Number(h.quantity) * Number(h.asset.currentPrice),
      unrealizedPnL:
        (Number(h.asset.currentPrice) - Number(h.averageCost)) * Number(h.quantity),
    }));

    const totalValue = holdingsWithValue.reduce(
      (sum: number, h: any) => sum + h.marketValue,
      0,
    );

    return { ...portfolio, holdings: holdingsWithValue, totalValue };
  }
}
