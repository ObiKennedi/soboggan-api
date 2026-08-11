import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LogActivity } from '../common/decorators/log-activity.decorator';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Post('accounts/:accountId/transactions')
  @LogActivity({ action: 'TRANSACTION_CREATED', entityType: 'Transaction' })
  create(
    @CurrentUser('userId') userId: string,
    @Param('accountId') accountId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.createForAccount(userId, accountId, dto);
  }

  @Get('accounts/:accountId/transactions')
  listForAccount(
    @CurrentUser('userId') userId: string,
    @Param('accountId') accountId: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.transactionsService.listForAccount(
      userId,
      accountId,
      take ? parseInt(take, 10) : 50,
      skip ? parseInt(skip, 10) : 0,
    );
  }

  @Get('transactions')
  listForUser(
    @CurrentUser('userId') userId: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.transactionsService.listForUser(
      userId,
      take ? parseInt(take, 10) : 50,
      skip ? parseInt(skip, 10) : 0,
    );
  }
}
