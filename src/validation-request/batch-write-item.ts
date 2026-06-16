import { HttpException, HttpStatus } from '@nestjs/common';

export function validateBatchWriteItem(body: Record<string, unknown>): void {
  const requestItems = body['RequestItems'];
  if (requestItems == null || typeof requestItems !== 'object' || Array.isArray(requestItems)) {
    throw new HttpException(
      { __type: 'ValidationException', message: 'RequestItems is required' },
      HttpStatus.BAD_REQUEST,
    );
  }
  for (const [tableName, requests] of Object.entries(requestItems as Record<string, unknown>)) {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new HttpException(
        { __type: 'ValidationException', message: `RequestItems.${tableName} must be a non-empty array` },
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const req of requests as Record<string, unknown>[]) {
      const hasPut = req['PutRequest'] != null;
      const hasDelete = req['DeleteRequest'] != null;
      if (!hasPut && !hasDelete) {
        throw new HttpException(
          { __type: 'ValidationException', message: 'Each request must have either PutRequest or DeleteRequest' },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (hasPut) {
        const putReq = req['PutRequest'] as Record<string, unknown>;
        if (putReq['Item'] == null || typeof putReq['Item'] !== 'object' || Array.isArray(putReq['Item'])) {
          throw new HttpException(
            { __type: 'ValidationException', message: 'PutRequest.Item is required' },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      if (hasDelete) {
        const deleteReq = req['DeleteRequest'] as Record<string, unknown>;
        if (deleteReq['Key'] == null || typeof deleteReq['Key'] !== 'object' || Array.isArray(deleteReq['Key'])) {
          throw new HttpException(
            { __type: 'ValidationException', message: 'DeleteRequest.Key is required' },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }
}
