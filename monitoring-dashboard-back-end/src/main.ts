// src/main.ts
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

function parseOrigins(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  // CORS allow-list
  const allowedOrigins = parseOrigins(
    process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL,
  );

  // Fail fast in production if you forgot to configure CORS
  if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGINS (or FRONTEND_URL) must be set in production');
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser clients (no Origin header)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Reject unknown origins
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false, // keep false unless you use cookie auth
    maxAge: 86400, // cache preflight for 24h
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true, // <-- key change
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // ... other middleware and pipes (next sections)

  await app.listen(Number(process.env.PORT ?? 3001));
  logger.log(`API listening on ${process.env.PORT ?? 3001}`);
}

bootstrap();
