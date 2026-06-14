export function stripId(doc: Record<string, unknown>): Record<string, unknown> {
  const result = { ...doc };
  delete result['_id'];
  return result;
}
