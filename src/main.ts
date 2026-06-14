import { AppModule } from './app.module.js';
import { NestFactory } from '@nestjs/core';
import { env } from 'node:process';
import express from 'express';
import 'reflect-metadata';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ type: ['application/json', 'application/x-amz-json-1.0'] }));
  const port = env.DYNAMODB_PORT ?? 8000;
  const hostname = env.DYNAMODB_HOSTNAME ?? 'localhost';
  await app.listen(port, hostname);
  console.log(`Server is running http://${hostname}:${port}`);
}

bootstrap();
