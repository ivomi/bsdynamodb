import { unmarshalValue } from './unmarshal-value.js';

export function buildKeyFilter(
  keySchema: Array<{ AttributeName: string }>,
  keyOrItem: Record<string, unknown>,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  for (const { AttributeName } of keySchema) {
    const av = keyOrItem[AttributeName];
    if (av != null) {
      filter[AttributeName] = unmarshalValue(av);
    }
  }
  return filter;
}
