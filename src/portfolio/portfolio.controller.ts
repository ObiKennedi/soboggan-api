import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PortfolioService } from './portfolio.service';

@Controller()
export class PortfolioController {
  constructor(private portfolioService: PortfolioService) {}

  @UseGuards(JwtAuthGuard)
  @Get('accounts/:accountId/portfolio')
  getForAccount(@CurrentUser('userId') userId: string, @Param('accountId') accountId: string) {
    return this.portfolioService.getForAccount(userId, accountId);
  }

  // Public — just the reference list of investable instruments, nothing user-specific
  @Get('assets')
  listAssets() {
    return this.portfolioService.listAssets();
  }
}
