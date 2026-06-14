import { marshalValue } from './marshal-value.js';

export function marshalItem(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, marshalValue(v)]));
}
