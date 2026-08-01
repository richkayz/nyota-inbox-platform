import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  const port = Number(process.env.PORT ?? 4000);
  // The gateway is intended to sit behind the local Plesk/nginx proxy.
  // Keep it off the public interface unless a deployment explicitly opts in.
  const host = process.env.HOST ?? '127.0.0.1';
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Entries may contain a single `*` wildcard label, e.g. https://*.lovable.app
  const originMatchers = origins.map((o) =>
    o.includes('*')
      ? new RegExp('^' + o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^./]+') + '$')
      : o,
  );

  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: originMatchers.length > 0 ? originMatchers : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Nyota-Session'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Nyota Inbox Mail Gateway')
    .setDescription('Bridges the NyotaMail UI with Plesk/Postfix/Dovecot.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, doc);

  await app.listen(port, host);
  logger.log(`Nyota Mail Gateway listening on ${host}:${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
