import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, TransactionStatus, TransactionType } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

// Types that increase balance vs. decrease it
const CREDIT_TYPES = new Set<TransactionType>([
  TransactionType.DEPOSIT,
  TransactionType.SELL,
  TransactionType.INTEREST,
  TransactionType.DIVIDEND,
  TransactionType.LOAN_DISBURSEMENT,
  TransactionType.TRANSFER_IN,
]);

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async createForAccount(userId: string, accountId: string, dto: CreateTransactionDto) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.userId !== userId) throw new ForbiddenException();

    return this.applyInternal(accountId, dto.type, dto.amount, dto.description, dto.metadata);
  }

  /**
   * Applies a balance-affecting transaction without an ownership check.
   * Only call this from trusted server-side flows (Paystack webhook,
   * loan disbursement/repayment) — never directly from a controller
   * that takes accountId from the request body.
   */
  async applyInternal(
    accountId: string,
    type: TransactionType,
    amount: number,
    description?: string,
    metadata?: any,
  ) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');

    const isCredit = CREDIT_TYPES.has(type);
    const delta = isCredit ? amount : -amount;

    if (!isCredit && Number(account.balance) + delta < 0) {
      throw new BadRequestException('Insufficient balance for this transaction');
    }

    // Balance update + transaction record must succeed or fail together
    const [, transaction] = await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: accountId },
        data: { balance: { increment: delta } },
      }),
      this.prisma.transaction.create({
        data: {
          accountId,
          type,
          amount,
          currency: account.currency,
          description,
          metadata: metadata ?? undefined,
          status: TransactionStatus.COMPLETED,
          reference: `TXN-${uuid()}`,
        },
      }),
    ]);

    await this.notificationsService.create({
      userId: account.userId,
      type: NotificationType.TRANSACTION,
      title: isCredit ? 'Funds received' : 'Funds debited',
      body: `${type.replace('_', ' ')} of ${account.currency} ${amount.toLocaleString()} on account ${account.accountNumber}`,
      metadata: { transactionId: transaction.id, accountId },
    });

    return transaction;
  }

  async listForAccount(userId: string, accountId: string, take = 50, skip = 0) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.userId !== userId) throw new ForbiddenException();

    return this.prisma.transaction.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async listForUser(userId: string, take = 50, skip = 0) {
    return this.prisma.transaction.findMany({
      where: { account: { userId } },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { account: { select: { accountNumber: true, type: true } } },
    });
  }
}
