export function parseUpdateExpression(
  expr: string,
  names: Record<string, string>,
  values: Record<string, unknown>,
  $set: Record<string, unknown>,
  $unset: Record<string, unknown>,
): void {
  const resolveName = (token: string) => names[token] ?? token;
  const resolveValue = (token: string) => values[token];

  const clauses = expr.split(/\b(SET|REMOVE|ADD|DELETE)\b/i);
  let currentClause = '';
  for (const part of clauses) {
    const upper = part.trim().toUpperCase();
    if (upper === 'SET' || upper === 'REMOVE' || upper === 'ADD' || upper === 'DELETE') {
      currentClause = upper;
      continue;
    }
    if (!part.trim()) continue;

    for (const assignment of part.split(',')) {
      const trimmed = assignment.trim();
      if (!trimmed) continue;

      if (currentClause === 'SET') {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const lhs = resolveName(trimmed.slice(0, eqIdx).trim());
        const rhs = trimmed.slice(eqIdx + 1).trim();
        $set[lhs] = resolveValue(rhs);
      } else if (currentClause === 'REMOVE') {
        $unset[resolveName(trimmed)] = '';
      }
    }
  }
}
