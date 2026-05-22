import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useWebSocketAdapter(new IoAdapter(app));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Tanks server listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error(`Fatal bootstrap error: ${err instanceof Error ? err.stack : String(err)}`, 'Bootstrap');
  process.exit(1);
});
