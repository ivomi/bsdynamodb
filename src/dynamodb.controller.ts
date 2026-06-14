import { Body, Controller, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import { DynamodbProvider } from './dynamodb.provider.js';

@Controller()
export class DynamodbController {
  constructor(private readonly dynamodbProvider: DynamodbProvider) {}

  @Post('/')
  async handle(@Headers('x-amz-target') target: string, @Body() body: Record<string, unknown>) {
    switch (target) {
      case 'DynamoDB_20120810.CreateTable':
        return this.dynamodbProvider.createTable(body);
      case 'DynamoDB_20120810.ListTables':
        return this.dynamodbProvider.listTables(body);
      default:
        throw new HttpException(
          { __type: 'UnknownOperationException', message: `Unknown operation: ${target}` },
          HttpStatus.BAD_REQUEST,
        );
    }
  }
}
