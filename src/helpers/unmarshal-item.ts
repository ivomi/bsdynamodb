import { unmarshalValue } from './unmarshal-value.js';

export function unmarshalItem(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, unmarshalValue(v)]));
}
