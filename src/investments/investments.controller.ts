import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InvestmentsService } from './investments.service';
import { CreateSellInstructionDto } from './dto/create-sell-instruction.dto';
import { CreateBuyInstructionDto } from './dto/create-buy-instruction.dto';

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private investmentsService: InvestmentsService) {}

  @Get('stocks')
  getAvailableStocks() {
    return this.investmentsService.getAvailableStocks();
  }

  @Post('buy-instructions')
  createBuyInstruction(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateBuyInstructionDto,
    @Req() req: any,
  ) {
    return this.investmentsService.createBuyInstruction(userId, dto, req.ip);
  }

  @Get('buy-instructions')
  listBuyInstructions(@CurrentUser('userId') userId: string) {
    return this.investmentsService.listBuyInstructions(userId);
  }

  @Post('sell-instructions')
  createSellInstruction(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateSellInstructionDto,
    @Req() req: any,
  ) {
    return this.investmentsService.createSellInstruction(userId, dto, req.ip);
  }

  @Get('sell-instructions')
  listSellInstructions(@CurrentUser('userId') userId: string) {
    return this.investmentsService.listSellInstructions(userId);
  }

  @Get('overview')
  getOverview(@CurrentUser('userId') userId: string) {
    return this.investmentsService.getOverview(userId);
  }

  @Get('logs')
  getInvestmentLogs(@CurrentUser('userId') userId: string) {
    return this.investmentsService.getInvestmentLogs(userId);
  }
}
