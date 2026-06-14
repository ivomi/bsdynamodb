export function parseListTables(body: Record<string, unknown>): {
  start: string | undefined;
  limit: number | undefined;
} {
  return {
    limit: typeof body['Limit'] === 'number' ? body['Limit'] : undefined,
    start:
      typeof body['ExclusiveStartTableName'] === 'string'
        ? body['ExclusiveStartTableName']
        : undefined,
  };
}
