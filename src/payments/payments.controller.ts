import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LogActivity } from '../common/decorators/log-activity.decorator';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private paystackService: PaystackService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('initialize')
  @LogActivity({ action: 'PAYMENT_INITIALIZED', entityType: 'Payment' })
  initialize(@CurrentUser('userId') userId: string, @Body() dto: InitializePaymentDto) {
    return this.paymentsService.initialize(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify/:reference')
  verify(@CurrentUser('userId') userId: string, @Param('reference') reference: string) {
    return this.paymentsService.verifyByReference(userId, reference);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.paymentsService.listForUser(
      userId,
      take ? parseInt(take, 10) : 30,
      skip ? parseInt(skip, 10) : 0,
    );
  }

  /**
   * Public endpoint — Paystack calls this directly, no JWT. Authenticity is
   * verified via the HMAC signature header instead. Requires `rawBody: true`
   * on the Nest app (set in main.ts) so we can hash the exact bytes received.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: any) {
    const signature = req.headers['x-paystack-signature'];
    const rawBody: Buffer = req.rawBody;

    if (!rawBody || !this.paystackService.verifyWebhookSignature(rawBody.toString('utf8'), signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    return this.paymentsService.handleWebhookEvent(req.body);
  }
}
