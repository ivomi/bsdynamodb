export function unmarshalValue(av: unknown): unknown {
  if (av == null || typeof av !== 'object' || Array.isArray(av)) return av;
  const obj = av as Record<string, unknown>;
  if ('S' in obj) return obj['S'];
  if ('N' in obj) return Number(obj['N']);
  if ('BOOL' in obj) return obj['BOOL'];
  if ('NULL' in obj) return null;
  if ('M' in obj)
    return Object.fromEntries(
      Object.entries(obj['M'] as Record<string, unknown>).map(([k, v]) => [k, unmarshalValue(v)]),
    );
  if ('L' in obj) return (obj['L'] as unknown[]).map(unmarshalValue);
  if ('SS' in obj) return obj['SS'];
  if ('NS' in obj) return (obj['NS'] as string[]).map(Number);
  if ('BS' in obj) return obj['BS'];
  if ('B' in obj) return obj['B'];
  return av;
}
