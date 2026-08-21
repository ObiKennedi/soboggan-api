import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { PusherModule } from './common/pusher/pusher.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { ActivityLogInterceptor } from './common/interceptors/activity-log.interceptor';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { TransactionsModule } from './transactions/transactions.module';
import { PaymentsModule } from './payments/payments.module';
import { LoansModule } from './loans/loans.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InvestmentsModule } from './investments/investments.module';
import { AdminModule } from './admin/admin.module';
import { RealEstateModule } from './real-estate/real-estate.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { BlogModule } from './blog/blog.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // Global infra
    PrismaModule,
    PusherModule,
    CloudinaryModule,
    ActivityLogModule,

    // Feature modules
    AuthModule,
    UsersModule,
    AccountsModule,
    PortfolioModule,
    InvestmentsModule,
    AdminModule,
    RealEstateModule,
    BlogModule,
    TransactionsModule,
    PaymentsModule,
    LoansModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityLogInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
