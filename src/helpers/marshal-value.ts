export function marshalValue(val: unknown): unknown {
  if (val === null) return { NULL: true };
  if (typeof val === 'boolean') return { BOOL: val };
  if (typeof val === 'string') return { S: val };
  if (typeof val === 'number') return { N: String(val) };
  if (Array.isArray(val)) return { L: val.map(marshalValue) };
  if (typeof val === 'object')
    return {
      M: Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, marshalValue(v)]),
      ),
    };
  return { S: String(val) };
}
