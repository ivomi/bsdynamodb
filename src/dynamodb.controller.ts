import { Body, Controller, Get, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import { DynamodbProvider } from './dynamodb.provider.js';

@Controller()
export class DynamodbController {
  constructor(private readonly dynamodbProvider: DynamodbProvider) {}

  @Get('/')
  get() {
    return { message: 'DynamoDB local server is running' };
  }

  @Post('/')
  async handle(@Headers('x-amz-target') target: string, @Body() body: Record<string, unknown>) {
    switch (target) {
      case 'DynamoDB_20120810.CreateTable':
        return this.dynamodbProvider.createTable(body);
      case 'DynamoDB_20120810.DescribeTable':
        return this.dynamodbProvider.describeTable(body);
      case 'DynamoDB_20120810.ListTables':
        return this.dynamodbProvider.listTables(body);
      case 'DynamoDB_20120810.DeleteTable':
        return this.dynamodbProvider.deleteTable(body);
      case 'DynamoDB_20120810.UpdateTable':
        return this.dynamodbProvider.updateTable(body);
      case 'DynamoDB_20120810.GetItem':
        return this.dynamodbProvider.getItem(body);
      case 'DynamoDB_20120810.PutItem':
        return this.dynamodbProvider.putItem(body);
      case 'DynamoDB_20120810.UpdateItem':
        return this.dynamodbProvider.updateItem(body);
      case 'DynamoDB_20120810.DeleteItem':
        return this.dynamodbProvider.deleteItem(body);
      case 'DynamoDB_20120810.Query':
        return this.dynamodbProvider.query(body);
      case 'DynamoDB_20120810.Scan':
        return this.dynamodbProvider.scan(body);
      case 'DynamoDB_20120810.DescribeTimeToLive':
        return this.dynamodbProvider.describeTimeToLive(body);
      case 'DynamoDB_20120810.DescribeContinuousBackups':
        return this.dynamodbProvider.describeContinuousBackups(body);
      case 'DynamoDB_20120810.UpdateContinuousBackups':
        return this.dynamodbProvider.updateContinuousBackups(body);
      case 'DynamoDB_20120810.BatchWriteItem':
        return this.dynamodbProvider.batchWriteItem(body);
      default:
        throw new HttpException(
          { __type: 'UnknownOperationException', message: `Unknown operation: ${target}` },
          HttpStatus.BAD_REQUEST,
        );
    }
  }
}
