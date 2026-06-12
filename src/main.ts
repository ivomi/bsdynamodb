import { NestFactory } from '@nestjs/core';
import { env } from 'node:process';
import 'reflect-metadata';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Server is running http://localhost:${port}`);
}

bootstrap();
