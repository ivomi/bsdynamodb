type NameToken = { type: 'name'; value: string };
type RefToken = { type: 'ref'; value: string };
type OpToken = { type: 'op'; value: string };
type KwToken = { type: 'kw'; value: string };
type PunctToken = { type: 'lparen' | 'rparen' | 'comma' };
type Token = NameToken | RefToken | OpToken | KwToken | PunctToken;

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'BETWEEN', 'IN']);
const FUNCTIONS = new Set([
  'attribute_exists',
  'attribute_not_exists',
  'attribute_type',
  'begins_with',
  'contains',
  'size',
]);

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i]!)) { i++; continue; }

    if (expr[i] === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (expr[i] === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (expr[i] === ',') { tokens.push({ type: 'comma' }); i++; continue; }

    if (expr.startsWith('<>', i)) { tokens.push({ type: 'op', value: '<>' }); i += 2; continue; }
    if (expr.startsWith('<=', i)) { tokens.push({ type: 'op', value: '<=' }); i += 2; continue; }
    if (expr.startsWith('>=', i)) { tokens.push({ type: 'op', value: '>=' }); i += 2; continue; }
    if (expr[i] === '<') { tokens.push({ type: 'op', value: '<' }); i++; continue; }
    if (expr[i] === '>') { tokens.push({ type: 'op', value: '>' }); i++; continue; }
    if (expr[i] === '=') { tokens.push({ type: 'op', value: '=' }); i++; continue; }

    if (expr[i] === '#') {
      const start = i++;
      while (i < expr.length && /\w/.test(expr[i]!)) i++;
      while (i < expr.length && expr[i] === '.') {
        i++;
        while (i < expr.length && /[\w#]/.test(expr[i]!)) i++;
      }
      tokens.push({ type: 'name', value: expr.slice(start, i) });
      continue;
    }

    if (expr[i] === ':') {
      const start = i++;
      while (i < expr.length && /\w/.test(expr[i]!)) i++;
      tokens.push({ type: 'ref', value: expr.slice(start, i) });
      continue;
    }

    if (/[a-zA-Z_]/.test(expr[i]!)) {
      const start = i;
      while (i < expr.length && /\w/.test(expr[i]!)) i++;
      const word = expr.slice(start, i);
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) {
        tokens.push({ type: 'kw', value: upper });
      } else if (FUNCTIONS.has(word)) {
        tokens.push({ type: 'kw', value: word });
      } else {
        // Attribute name — consume any dot-notation continuation
        while (i < expr.length && expr[i] === '.') {
          i++;
          while (i < expr.length && /[\w#]/.test(expr[i]!)) i++;
        }
        tokens.push({ type: 'name', value: expr.slice(start, i) });
      }
      continue;
    }

    throw new Error(`Unexpected character at position ${i}: '${expr[i]}'`);
  }
  return tokens;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseFilterExpression(
  expr: string,
  names: Record<string, string>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const tokens = tokenize(expr);
  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }
  function consume(): Token { return tokens[pos++]!; }

  function isKw(value: string): boolean {
    const t = peek();
    return t?.type === 'kw' && (t as KwToken).value === value;
  }

  function resolveName(raw: string): string {
    return raw.split('.').map(part => (part.startsWith('#') ? (names[part] ?? part.slice(1)) : part)).join('.');
  }

  function resolveRef(key: string): unknown {
    return values[key];
  }

  function parseExpr(): Record<string, unknown> {
    return parseOr();
  }

  function parseOr(): Record<string, unknown> {
    let left = parseAnd();
    while (isKw('OR')) {
      consume();
      left = { $or: [left, parseAnd()] };
    }
    return left;
  }

  function parseAnd(): Record<string, unknown> {
    let left = parseNot();
    while (isKw('AND')) {
      consume();
      left = { $and: [left, parseNot()] };
    }
    return left;
  }

  function parseNot(): Record<string, unknown> {
    if (isKw('NOT')) {
      consume();
      return { $nor: [parseNot()] };
    }
    return parseAtom();
  }

  function parseAtom(): Record<string, unknown> {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');

    if (t.type === 'lparen') {
      consume();
      const inner = parseExpr();
      if (peek()?.type !== 'rparen') throw new Error('Expected )');
      consume();
      return inner;
    }

    if (t.type === 'kw' && FUNCTIONS.has((t as KwToken).value)) {
      return parseFunctionCall();
    }

    return parseComparison();
  }

  function parseFunctionCall(): Record<string, unknown> {
    const fn = (consume() as KwToken).value;
    if (peek()?.type !== 'lparen') throw new Error(`Expected ( after ${fn}`);
    consume();

    const args: unknown[] = [];
    while (peek()?.type !== 'rparen') {
      const t = peek();
      if (!t) throw new Error('Unexpected end in function call');
      if (t.type === 'name') args.push(resolveName((consume() as NameToken).value));
      else if (t.type === 'ref') args.push(resolveRef((consume() as RefToken).value));
      else throw new Error(`Unexpected token in function args: ${t.type}`);
      if (peek()?.type === 'comma') consume();
    }
    consume(); // rparen

    const path = args[0] as string;
    switch (fn) {
      case 'attribute_exists':
        return { [path]: { $exists: true } };
      case 'attribute_not_exists':
        return { [path]: { $exists: false } };
      case 'begins_with':
        return { [path]: { $regex: new RegExp(`^${escapeRegex(String(args[1]))}`) } };
      case 'contains': {
        const val = args[1];
        if (typeof val === 'string') return { [path]: { $regex: new RegExp(escapeRegex(val)) } };
        return { [path]: val };
      }
      default:
        throw new Error(`Unsupported function: ${fn}`);
    }
  }

  function parseComparison(): Record<string, unknown> {
    const lhs = parseOperand();

    if (isKw('BETWEEN')) {
      consume();
      const low = parseOperand();
      if (!isKw('AND')) throw new Error('Expected AND after BETWEEN lower bound');
      consume();
      const high = parseOperand();
      return { [String(lhs)]: { $gte: low, $lte: high } };
    }

    if (isKw('IN')) {
      consume();
      if (peek()?.type !== 'lparen') throw new Error('Expected ( after IN');
      consume();
      const vals: unknown[] = [];
      while (peek()?.type !== 'rparen') {
        vals.push(parseOperand());
        if (peek()?.type === 'comma') consume();
      }
      consume();
      return { [String(lhs)]: { $in: vals } };
    }

    const t = peek();
    if (t?.type === 'op') {
      consume();
      const rhs = parseOperand();
      return applyOp(String(lhs), (t as OpToken).value, rhs);
    }

    // Bare name with no operator — treat as attribute_exists
    return { [String(lhs)]: { $exists: true } };
  }

  function parseOperand(): unknown {
    const t = peek();
    if (!t) throw new Error('Expected operand');
    if (t.type === 'name') return resolveName((consume() as NameToken).value);
    if (t.type === 'ref') return resolveRef((consume() as RefToken).value);
    throw new Error(`Expected operand, got ${t.type}`);
  }

  function applyOp(field: string, op: string, rhs: unknown): Record<string, unknown> {
    switch (op) {
      case '=': return { [field]: rhs };
      case '<>': return { [field]: { $ne: rhs } };
      case '<': return { [field]: { $lt: rhs } };
      case '<=': return { [field]: { $lte: rhs } };
      case '>': return { [field]: { $gt: rhs } };
      case '>=': return { [field]: { $gte: rhs } };
      default: throw new Error(`Unknown operator: ${op}`);
    }
  }

  return parseExpr();
}
