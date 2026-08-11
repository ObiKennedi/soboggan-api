import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, TransactionType } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { PaystackService } from './paystack.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private paystackService: PaystackService,
    private transactionsService: TransactionsService,
  ) {}

  async initialize(userId: string, dto: InitializePaymentDto) {
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.userId !== userId) throw new ForbiddenException();

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const reference = `PSK-${uuid()}`;

    const paystackResponse = await this.paystackService.initializeTransaction({
      email: user.email,
      amountNaira: dto.amount,
      reference,
      metadata: { userId, accountId: dto.accountId },
    });

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        reference,
        amount: dto.amount,
        currency: account.currency,
        status: PaymentStatus.INITIATED,
        authorizationUrl: paystackResponse.data.authorization_url,
        metadata: { accountId: dto.accountId },
      },
    });

    return {
      paymentId: payment.id,
      reference,
      authorizationUrl: paystackResponse.data.authorization_url,
    };
  }

  /** Handles the raw webhook payload after signature verification in the controller. */
  async handleWebhookEvent(event: { event: string; data: any }) {
    if (event.event !== 'charge.success') {
      this.logger.log(`Ignoring unhandled Paystack event: ${event.event}`);
      return { received: true };
    }

    await this.finalizeSuccessfulPayment(event.data.reference, event.data);
    return { received: true };
  }

  /** Manual fallback if the app wants to confirm status right after redirect, before the webhook lands. */
  async verifyByReference(userId: string, reference: string) {
    const payment = await this.prisma.payment.findUnique({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== userId) throw new ForbiddenException();

    if (payment.status === PaymentStatus.SUCCESS) return payment;

    const verification = await this.paystackService.verifyTransaction(reference);
    if (verification.data.status === 'success') {
      return this.finalizeSuccessfulPayment(reference, verification.data);
    }

    return this.prisma.payment.update({
      where: { reference },
      data: {
        status:
          verification.data.status === 'failed'
            ? PaymentStatus.FAILED
            : PaymentStatus.ABANDONED,
        channel: verification.data.channel,
      },
    });
  }

  async listForUser(userId: string, take = 30, skip = 0) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  private async finalizeSuccessfulPayment(reference: string, providerData: any) {
    const payment = await this.prisma.payment.findUnique({ where: { reference } });
    if (!payment) {
      this.logger.warn(`Webhook for unknown payment reference: ${reference}`);
      return null;
    }

    // Idempotency: a webhook can be retried by Paystack, and the manual
    // verify endpoint can also race with it.
    if (payment.status === PaymentStatus.SUCCESS) return payment;

    const accountId = (payment.metadata as any)?.accountId;
    if (!accountId) {
      throw new BadRequestException('Payment is missing its target account reference');
    }

    const transaction = await this.transactionsService.applyInternal(
      accountId,
      TransactionType.DEPOSIT,
      Number(payment.amount),
      'Wallet funding via Paystack',
    );

    return this.prisma.payment.update({
      where: { reference },
      data: {
        status: PaymentStatus.SUCCESS,
        channel: providerData.channel,
        paidAt: providerData.paid_at ? new Date(providerData.paid_at) : new Date(),
        transactionId: transaction.id,
      },
    });
  }
}
