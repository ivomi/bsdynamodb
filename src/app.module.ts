import { DynamodbController } from './dynamodb.controller.js';
import { DynamodbProvider } from './dynamodb.provider.js';
import { ConfigService } from './config.service.js';
import { Module } from '@nestjs/common';

@Module({
  controllers: [DynamodbController],
  providers: [ConfigService, DynamodbProvider],
})
export class AppModule {}
