import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssetType, BuyInstruction, SellInstruction } from '@prisma/client';
import { randomUUID } from 'crypto';

type BuyInstructionFull = BuyInstruction & {
  user: { id: string; firstName: string; lastName: string; email: string };
  listing?: { title: string; pricePerUnit: any } | null;
};

type SellInstructionFull = SellInstruction & {
  user: { id: string; firstName: string; lastName: string; email: string };
};

@Injectable()
export class PortfolioExecutionService {
  private readonly logger = new Logger(PortfolioExecutionService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Called when admin marks a BuyInstruction as EXECUTED.
   * Within a single DB transaction:
   *   1. Finds the user's INVESTMENT account (falls back to SAVINGS)
   *   2. Deducts totalCost from account.balance
   *   3. Upserts Asset record
   *   4. Upserts Portfolio for that account
   *   5. Upserts Holding (quantity + averageCost)
   *   6. Creates a BUY Transaction record
   * Then sends client notification via Pusher + Expo push.
   */
  async executePortfolioPurchase(instruction: BuyInstructionFull): Promise<void> {
    const { userId, stockSymbol, stockName, unitPrice, quantity, totalCost, assetCategory } =
      instruction;

    const qty = Number(quantity);
    const price = Number(unitPrice);
    const cost = Number(totalCost);

    // ── 1. Find billing account ─────────────────────────────────────────────
    const account = await this.prisma.account.findFirst({
      where: {
        userId,
        type: { in: ['INVESTMENT', 'SAVINGS'] },
        status: 'ACTIVE',
      },
      orderBy: [{ type: 'asc' }], // INVESTMENT < SAVINGS alphabetically
    });

    if (!account) {
      this.logger.warn(`No active account found for user ${userId} — skipping portfolio execution`);
      return;
    }

    if (Number(account.balance) < cost) {
      this.logger.warn(
        `Account ${account.id} balance (${account.balance}) < cost (${cost}) — skipping deduction`,
      );
      // Still record but don't throw — admin may handle separately
    }

    const reference = `BUY-${randomUUID().slice(0, 8).toUpperCase()}`;

    // ── 2. Map assetCategory → AssetType ────────────────────────────────────
    const assetType: AssetType =
      assetCategory === 'CRYPTO'
        ? 'OTHER'
        : assetCategory === 'REAL_ESTATE'
        ? 'REAL_ESTATE'
        : 'STOCK';

    // ── 3. Execute all DB writes atomically ─────────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      // Deduct balance
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { decrement: cost } },
      });

      // Upsert Asset
      const asset = await tx.asset.upsert({
        where: { symbol: stockSymbol.toUpperCase() },
        update: { currentPrice: price, name: stockName },
        create: {
          symbol: stockSymbol.toUpperCase(),
          name: stockName,
          type: assetType,
          currency: 'NGN',
          currentPrice: price,
        },
      });

      // Upsert Portfolio (INVESTMENT account gets its own portfolio)
      const portfolio = await tx.portfolio.upsert({
        where: { accountId: account.id },
        update: {},
        create: {
          accountId: account.id,
          name: 'Primary Portfolio',
          currency: 'NGN',
          totalValue: 0,
        },
      });

      // Upsert Holding — update quantity and recompute weighted average cost
      const existing = await tx.holding.findUnique({
        where: { portfolioId_assetId: { portfolioId: portfolio.id, assetId: asset.id } },
      });

      if (existing) {
        const newQty = Number(existing.quantity) + qty;
        const newAvgCost =
          (Number(existing.quantity) * Number(existing.averageCost) + cost) / newQty;
        await tx.holding.update({
          where: { id: existing.id },
          data: { quantity: newQty, averageCost: newAvgCost },
        });
      } else {
        await tx.holding.create({
          data: {
            portfolioId: portfolio.id,
            assetId: asset.id,
            quantity: qty,
            averageCost: price,
          },
        });
      }

      // Create BUY Transaction record
      await tx.transaction.create({
        data: {
          accountId: account.id,
          type: 'BUY',
          status: 'COMPLETED',
          amount: cost,
          currency: 'NGN',
          reference,
          description: `Purchased ${qty} units of ${stockSymbol.toUpperCase()} @ ₦${price.toLocaleString()}`,
          metadata: {
            assetCategory,
            stockSymbol,
            stockName,
            quantity: qty,
            unitPrice: price,
            instructionId: instruction.id,
          },
        },
      });
    });

    this.logger.log(
      `Portfolio execution complete: ${qty}x${stockSymbol} for user ${userId} [ref: ${reference}]`,
    );

    // ── 4. Notify client ────────────────────────────────────────────────────
    const categoryEmoji =
      assetCategory === 'CRYPTO' ? '🪙' : assetCategory === 'REAL_ESTATE' ? '🏠' : '📈';

    await this.notificationsService.create({
      userId,
      type: 'PORTFOLIO_UPDATE',
      title: `${categoryEmoji} Purchase Executed — ${stockSymbol.toUpperCase()}`,
      body: `${qty} unit${qty !== 1 ? 's' : ''} of ${stockName} purchased for ₦${cost.toLocaleString()}. Your portfolio has been updated and your account balance reduced accordingly.`,
      metadata: {
        assetCategory,
        stockSymbol,
        stockName,
        quantity: qty,
        unitPrice: price,
        totalCost: cost,
        reference,
        instructionId: instruction.id,
      },
    });
  }

  /**
   * Called when admin marks a SellInstruction as EXECUTED.
   * Validates:
   *   1. The client actually owns the asset and has >= requested quantity.
   *   2. Increases client's account balance by the sale value (quantity * price).
   *   3. Decrements or removes the holding from client's portfolio.
   *   4. Records a COMPLETED SELL transaction.
   *   5. Notifies client via Pusher + Push notifications.
   */
  async executePortfolioSale(instruction: SellInstructionFull): Promise<void> {
    const { userId, assetSymbol, assetName, quantity, targetPrice } = instruction;
    const qtyToSell = Number(quantity);

    // ── 1. Find all accounts and check client holding ownership ─────────────
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

    let targetHolding: any = null;
    let targetAccount: any = null;

    for (const acc of userAccounts) {
      if (acc.portfolio) {
        for (const h of acc.portfolio.holdings) {
          if (h.asset.symbol.toUpperCase() === assetSymbol.toUpperCase()) {
            targetHolding = h;
            targetAccount = acc;
            break;
          }
        }
      }
      if (targetHolding) break;
    }

    const currentOwnedQty = targetHolding ? Number(targetHolding.quantity) : 0;

    if (!targetHolding || currentOwnedQty < qtyToSell) {
      throw new BadRequestException(
        `Cannot execute sale: Client owns ${currentOwnedQty} unit(s) of ${assetSymbol.toUpperCase()}, but sale instruction requested ${qtyToSell} unit(s).`,
      );
    }

    // ── 2. Determine credit account & proceeds ──────────────────────────────
    const creditAccount =
      userAccounts.find((a) => a.type === 'SAVINGS' && a.status === 'ACTIVE') ||
      userAccounts.find((a) => a.type === 'INVESTMENT' && a.status === 'ACTIVE') ||
      targetAccount;

    if (!creditAccount) {
      throw new BadRequestException('No active client account found to credit sale proceeds.');
    }

    const saleUnitPrice = Number(targetPrice ?? targetHolding.asset.currentPrice ?? 0);
    const totalProceeds = qtyToSell * saleUnitPrice;
    const reference = `SELL-${randomUUID().slice(0, 8).toUpperCase()}`;

    // ── 3. Execute DB writes atomically ─────────────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      // 1. Credit account balance
      if (totalProceeds > 0) {
        await tx.account.update({
          where: { id: creditAccount.id },
          data: { balance: { increment: totalProceeds } },
        });
      }

      // 2. Decrement holding or delete if 0
      const remainingQty = currentOwnedQty - qtyToSell;
      if (remainingQty <= 0) {
        await tx.holding.delete({
          where: { id: targetHolding.id },
        });
      } else {
        await tx.holding.update({
          where: { id: targetHolding.id },
          data: { quantity: remainingQty },
        });
      }

      // 3. Create SELL Transaction record
      await tx.transaction.create({
        data: {
          accountId: creditAccount.id,
          type: 'SELL',
          status: 'COMPLETED',
          amount: totalProceeds,
          currency: 'NGN',
          reference,
          description: `Sold ${qtyToSell} units of ${assetSymbol.toUpperCase()} @ ₦${saleUnitPrice.toLocaleString()} — Proceeds credited`,
          metadata: {
            assetSymbol: assetSymbol.toUpperCase(),
            assetName,
            quantity: qtyToSell,
            unitPrice: saleUnitPrice,
            totalProceeds,
            instructionId: instruction.id,
          },
        },
      });
    });

    this.logger.log(
      `Portfolio sale complete: ${qtyToSell}x${assetSymbol} for user ${userId} [credited: ₦${totalProceeds.toLocaleString()}, ref: ${reference}]`,
    );

    // ── 4. Notify client ────────────────────────────────────────────────────
    await this.notificationsService.create({
      userId,
      type: 'PORTFOLIO_UPDATE',
      title: `💰 Sale Executed — ${assetSymbol.toUpperCase()}`,
      body: `Your sale of ${qtyToSell} unit${qtyToSell !== 1 ? 's' : ''} of ${assetName || assetSymbol} has been executed for ₦${totalProceeds.toLocaleString()}. The proceeds have been credited to your ${creditAccount.type} account.`,
      metadata: {
        assetSymbol: assetSymbol.toUpperCase(),
        assetName,
        quantity: qtyToSell,
        unitPrice: saleUnitPrice,
        totalProceeds,
        reference,
        instructionId: instruction.id,
      },
    });
  }
}

