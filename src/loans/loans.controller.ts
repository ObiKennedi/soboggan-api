import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LogActivity } from '../common/decorators/log-activity.decorator';
import { LoansService } from './loans.service';
import { ApplyForLoanDto, RepayLoanDto } from './dto/loan.dto';

@UseGuards(JwtAuthGuard)
@Controller('loans')
export class LoansController {
  constructor(private loansService: LoansService) {}

  @Post()
  @LogActivity({ action: 'LOAN_APPLIED', entityType: 'Loan' })
  apply(@CurrentUser('userId') userId: string, @Body() dto: ApplyForLoanDto) {
    return this.loansService.apply(userId, dto);
  }

  @Get()
  listMine(@CurrentUser('userId') userId: string) {
    return this.loansService.listForUser(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.loansService.findOneForUser(userId, id);
  }

  @Post(':id/repay')
  @LogActivity({ action: 'LOAN_REPAYMENT', entityType: 'Loan' })
  repay(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: RepayLoanDto,
  ) {
    return this.loansService.repay(userId, id, dto);
  }

  // ----- Advisor / Admin only -----

  @UseGuards(RolesGuard)
  @Roles('ADVISOR', 'ADMIN')
  @Get('admin/all')
  listAll() {
    return this.loansService.listAll();
  }

  @UseGuards(RolesGuard)
  @Roles('ADVISOR', 'ADMIN')
  @Patch(':id/approve')
  @LogActivity({ action: 'LOAN_APPROVED', entityType: 'Loan' })
  approve(@Param('id') id: string, @Body('interestRate') interestRate?: number) {
    return this.loansService.approve(id, interestRate);
  }

  @UseGuards(RolesGuard)
  @Roles('ADVISOR', 'ADMIN')
  @Patch(':id/reject')
  @LogActivity({ action: 'LOAN_REJECTED', entityType: 'Loan' })
  reject(@Param('id') id: string) {
    return this.loansService.reject(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/disburse')
  @LogActivity({ action: 'LOAN_DISBURSED', entityType: 'Loan' })
  disburse(@Param('id') id: string) {
    return this.loansService.disburse(id);
  }
}
