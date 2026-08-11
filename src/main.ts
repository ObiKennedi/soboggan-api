import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // rawBody: true preserves the exact request bytes on req.rawBody,
  // needed to verify the Paystack webhook HMAC signature.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const config = app.get(ConfigService);

  app.enableCors({
    origin: true, // tighten to your RN app / admin dashboard origins in production
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api/v1', {
    exclude: [], // keep webhook under the same prefix; Paystack dashboard URL should match
  });

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  console.log(`Soboggan API running on http://localhost:${port}/api/v1`);
}

bootstrap();
