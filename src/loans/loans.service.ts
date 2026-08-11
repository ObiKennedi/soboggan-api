import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, LoanStatus, NotificationType, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApplyForLoanDto, RepayLoanDto } from './dto/loan.dto';

const DEFAULT_INTEREST_RATE = 5; // % flat, over the full tenure — adjustable at approval

@Injectable()
export class LoansService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private notificationsService: NotificationsService,
  ) {}

  async apply(userId: string, dto: ApplyForLoanDto) {
    const accountNumber = await this.generateAccountNumber();

    const account = await this.prisma.account.create({
      data: {
        userId,
        type: AccountType.LOAN,
        accountNumber,
        currency: 'NGN',
      },
    });

    return this.prisma.loan.create({
      data: {
        userId,
        accountId: account.id,
        principal: dto.principal,
        tenureMonths: dto.tenureMonths,
        purpose: dto.purpose,
        interestRate: DEFAULT_INTEREST_RATE,
        outstandingBalance: 0,
        status: LoanStatus.APPLIED,
      },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.loan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAll() {
    // For advisors/admins reviewing applications
    return this.prisma.loan.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async findOneForUser(userId: string, loanId: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.userId !== userId) throw new ForbiddenException();
    return loan;
  }

  /** Advisor/Admin only — enforced by RolesGuard at the controller. */
  async approve(loanId: string, interestRate?: number) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.APPLIED) {
      throw new BadRequestException('Only APPLIED loans can be approved');
    }

    return this.prisma.loan.update({
      where: { id: loanId },
      data: {
        status: LoanStatus.APPROVED,
        interestRate: interestRate ?? loan.interestRate,
        approvedAt: new Date(),
      },
    });
  }

  async reject(loanId: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.APPLIED) {
      throw new BadRequestException('Only APPLIED loans can be rejected');
    }
    return this.prisma.loan.update({
      where: { id: loanId },
      data: { status: LoanStatus.REJECTED },
    });
  }

  /** Admin only — moves funds into the borrower's loan account. */
  async disburse(loanId: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED loans can be disbursed');
    }

    const totalRepayable =
      Number(loan.principal) + Number(loan.principal) * (Number(loan.interestRate) / 100);

    await this.transactionsService.applyInternal(
      loan.accountId,
      TransactionType.LOAN_DISBURSEMENT,
      Number(loan.principal),
      `Loan disbursement for ${loan.tenureMonths}-month facility`,
    );

    const updated = await this.prisma.loan.update({
      where: { id: loanId },
      data: {
        status: LoanStatus.REPAYING,
        outstandingBalance: totalRepayable,
        disbursedAt: new Date(),
      },
    });

    await this.notificationsService.create({
      userId: loan.userId,
      type: NotificationType.LOAN_UPDATE,
      title: 'Loan disbursed',
      body: `Your loan of NGN ${Number(loan.principal).toLocaleString()} has been disbursed. Total repayable: NGN ${totalRepayable.toLocaleString()}.`,
      metadata: { loanId },
    });

    return updated;
  }

  async repay(userId: string, loanId: string, dto: RepayLoanDto) {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.userId !== userId) throw new ForbiddenException();
    if (loan.status !== LoanStatus.REPAYING) {
      throw new BadRequestException('This loan is not currently accepting repayments');
    }
    if (dto.amount > Number(loan.outstandingBalance)) {
      throw new BadRequestException('Repayment amount exceeds outstanding balance');
    }

    await this.transactionsService.applyInternal(
      loan.accountId,
      TransactionType.LOAN_REPAYMENT,
      dto.amount,
      'Loan repayment',
    );

    const newOutstanding = Number(loan.outstandingBalance) - dto.amount;
    const isFullyPaid = newOutstanding <= 0;

    return this.prisma.loan.update({
      where: { id: loanId },
      data: {
        outstandingBalance: isFullyPaid ? 0 : newOutstanding,
        status: isFullyPaid ? LoanStatus.CLOSED : LoanStatus.REPAYING,
        closedAt: isFullyPaid ? new Date() : null,
      },
    });
  }

  private async generateAccountNumber(): Promise<string> {
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
