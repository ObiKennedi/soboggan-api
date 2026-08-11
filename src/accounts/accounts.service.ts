import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateAccountDto) {
    const account = await this.prisma.account.create({
      data: {
        userId,
        type: dto.type,
        currency: dto.currency ?? 'NGN',
        accountNumber: await this.generateAccountNumber(),
      },
    });

    // Investment accounts get a portfolio shell automatically
    if (dto.type === AccountType.INVESTMENT) {
      await this.prisma.portfolio.create({
        data: { accountId: account.id, currency: account.currency },
      });
    }

    return account;
  }

  async findAllForUser(userId: string) {
    return this.prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForUser(userId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.userId !== userId) throw new ForbiddenException();
    return account;
  }

  /** Called internally by the transactions/payments modules — trusted callers only. */
  async adjustBalance(accountId: string, delta: number) {
    return this.prisma.account.update({
      where: { id: accountId },
      data: { balance: { increment: delta } },
    });
  }

  private async generateAccountNumber(): Promise<string> {
    // 10-digit NUBAN-style number; retry on the rare collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = Math.floor(1_000_000_000 + Math.random() * 9_000_000_000).toString();
      const exists = await this.prisma.account.findUnique({
        where: { accountNumber: candidate },
      });
      if (!exists) return candidate;
    }
    throw new Error('Could not generate a unique account number, please retry');
  }
}
