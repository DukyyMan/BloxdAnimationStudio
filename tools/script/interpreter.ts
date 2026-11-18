import { parse } from 'acorn';
const limits = { code: 64000 };

// Acorn is the parser, not the runtime. No host functions/objects are reachable via
// JS property access: the interpreter dispatches its own value types and opcodes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;
type Value = unknown;
export class ScriptError extends Error {
  line: number;
  column: number;
  constructor(message: string, loc?: { line: number; column: number }) {
    super(message);
    this.name = 'ScriptError';
    this.line = loc?.line ?? 1;
    this.column = (loc?.column ?? 0) + 1;
  }
}
const blocked = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'caller',
  'callee',
  'arguments',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);
const forbidden = new Set([
  'eval',
  'Function',
  'globalThis',
  'self',
  'window',
  'document',
  'navigator',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'postMessage',
  'importScripts',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'setTimeout',
  'setInterval',
  'WebAssembly',
  'Reflect',
  'Proxy',
]);
const safeNodes = new Set(
  `Program FunctionDeclaration FunctionExpression ArrowFunctionExpression Identifier BlockStatement EmptyStatement VariableDeclaration VariableDeclarator ObjectPattern ArrayPattern AssignmentPattern Property Literal ObjectExpression ArrayExpression MemberExpression CallExpression ExpressionStatement ReturnStatement AwaitExpression ForStatement ForOfStatement WhileStatement DoWhileStatement IfStatement ConditionalExpression BreakStatement ContinueStatement BinaryExpression LogicalExpression UnaryExpression UpdateExpression AssignmentExpression TemplateLiteral TemplateElement SpreadElement`.split(
    ' ',
  ),
);
const binaries = new Set(['+', '-', '*', '/', '%', '**', '===', '!==', '==', '!=', '<', '<=', '>', '>=']);
const assignments = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=']);
const loc = (n: Node) => n?.loc?.start;
const fail = (n: Node, message: string): never => {
  throw new ScriptError(message, loc(n));
};
const functions = new WeakMap<object, (args: Value[]) => Value>();
export function native(call: (args: Value[]) => Value) {
  const value = Object.freeze(Object.create(null) as object);
  functions.set(value, call);
  return value;
}
export function record<T extends Record<string, unknown>>(fields: T): T {
  return Object.freeze(Object.assign(Object.create(null), fields));
}
const rawRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  Object.getPrototypeOf(value) === null &&
  !functions.has(value);
type Cell = { v: Value; mutable: boolean };
class Scope {
  readonly cells = new Map<string, Cell>();
  constructor(readonly parent?: Scope) {}
  declare(name: string, v: Value, mutable: boolean, n: Node) {
    if (this.cells.has(name)) fail(n, `“${name}” is already declared.`);
    this.cells.set(name, { v, mutable });
  }
  lookup(name: string, n: Node): Cell {
    const here = this.cells.get(name);
    if (here) return here;
    return this.parent
      ? this.parent.lookup(name, n)
      : fail(n, `Unknown identifier “${name}”. Use the documented animation API.`);
  }
}
class Jump {
  constructor(
    readonly type: 'return' | 'break' | 'continue',
    readonly value?: Value,
  ) {}
}

export function interpret(
  code: string,
  api: unknown,
  math: unknown,
  options: { maxSteps?: number; maxMs?: number } = {},
): number {
  if (code.length > limits.code)
    throw new ScriptError(`Script exceeds ${limits.code.toLocaleString()} characters.`);
  const deadline = performance.now() + (options.maxMs ?? 1450);
  let ast: Node;
  try {
    ast = parse(code, { ecmaVersion: 2022, locations: true, sourceType: 'script' });
  } catch (e) {
    const err = e as Error & { loc?: { line: number; column: number } };
    throw new ScriptError(err.message.replace(/\s*\(\d+:\d+\)$/, ''), err.loc);
  }
  let nodes = 0;
  function check(n: Node, depth: number) {
    if (!n?.type) return;
    if (++nodes > 16000 || depth > 90) fail(n, 'Script structure is too large or deeply nested.');
    if (!safeNodes.has(n.type))
      fail(n, `${n.type.replace(/([a-z])([A-Z])/g, '$1 $2')} is not supported in Studio scripts.`);
    if (n.type === 'Identifier' && (forbidden.has(n.name) || blocked.has(n.name)))
      fail(n, `“${n.name}” is not available in Studio scripts.`);
    if (n.type === 'Literal' && (n.regex || n.bigint !== undefined))
      fail(n, 'Regular expressions and BigInt are not supported.');
    if (n.type === 'Property' && (n.kind !== 'init' || n.method))
      fail(n, 'Object literals support data properties only.');
    if (n.type === 'BinaryExpression' && !binaries.has(n.operator))
      fail(n, `Operator “${n.operator}” is not supported.`);
    if (n.type === 'AssignmentExpression' && !assignments.has(n.operator))
      fail(n, `Assignment “${n.operator}” is not supported.`);
    if (n.type === 'UnaryExpression' && !['+', '-', '!', 'typeof'].includes(n.operator))
      fail(n, `Operator “${n.operator}” is not supported.`);
    if (n.type === 'VariableDeclaration' && n.kind === 'var') fail(n, 'Use let or const, not var.');
    if (n.generator) fail(n, 'Generator functions are not supported.');
    for (const [key, child] of Object.entries(n))
      if (
        !['loc', 'start', 'end', 'value', 'raw'].includes(key) ||
        (key === 'value' && n.type === 'Property')
      ) {
        if (Array.isArray(child)) for (const c of child) check(c, depth + 1);
        else check(child, depth + 1);
      }
  }
  check(ast, 0);
  if (
    ast.body.some(
      (n: Node) => !['FunctionDeclaration', 'VariableDeclaration', 'EmptyStatement'].includes(n.type),
    )
  )
    fail(
      ast.body.find(
        (n: Node) => !['FunctionDeclaration', 'VariableDeclaration', 'EmptyStatement'].includes(n.type),
      ),
      'Put executable code inside main(api).',
    );
  const entry = ast.body.find((n: Node) => n.type === 'FunctionDeclaration' && n.id?.name === 'main');
  if (
    !entry ||
    !entry.async ||
    entry.params.length !== 1 ||
    entry.params[0].type !== 'Identifier' ||
    entry.params[0].name !== 'api'
  )
    fail(entry ?? ast, 'Define async function main(api) as the entry point.');

  let steps = 0,
    memory = 0,
    depth = 0;
  const userFns = new WeakMap<object, { node: Node; env: Scope }>();
  function tick(n: Node, cost = 1) {
    steps += cost;
    if (steps > (options.maxSteps ?? 125000))
      fail(n, 'Operation limit reached. Reduce loop iterations or generated content.');
    if ((steps & 127) < cost && performance.now() > deadline) fail(n, 'Execution time limit reached.');
  }
  function allocate(n: Node, size: number) {
    memory += size;
    if (memory > 850000) fail(n, 'Script allocation limit reached.');
  }
  function string(n: Node, value: string) {
    if (value.length > 16384) fail(n, 'String exceeds 16,384 characters.');
    allocate(n, value.length + 1);
    return value;
  }
  function number(n: Node, value: Value): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail(n, 'Expected a finite number.');
    return value;
  }
  function scalar(n: Node, x: Value) {
    if (x != null && typeof x !== 'number' && typeof x !== 'string' && typeof x !== 'boolean')
      return fail(n, 'Expected a primitive value.');
    return x as string | number | boolean | null | undefined;
  }
  function key(n: Node, value: Value) {
    if (typeof value !== 'string' && typeof value !== 'number')
      return fail(n, 'Property keys must be strings or numbers.');
    const k = String(value);
    if (blocked.has(k) || forbidden.has(k) || k.length > 120)
      fail(n, `Property “${k.slice(0, 120)}” is not available.`);
    return k;
  }
  function read(object: Value, k: string, n: Node): Value {
    if (Array.isArray(object)) {
      if (k === 'length') return object.length;
      if (/^(0|[1-9]\d*)$/.test(k)) return object[Number(k)];
      if (k === 'push')
        return native((args) => {
          if (Object.isFrozen(object)) fail(n, 'This asset list is read-only.');
          if (object.length + args.length > 4096) fail(n, 'Array limit is 4096 entries.');
          allocate(n, 8 * args.length);
          return object.push(...args);
        });
      if (k === 'pop')
        return native(() => {
          if (Object.isFrozen(object)) fail(n, 'This asset list is read-only.');
          return object.pop();
        });
      if (k === 'slice')
        return native((args) => {
          const list = object.slice(
            args[0] === undefined ? 0 : number(n, args[0]),
            args[1] === undefined ? undefined : number(n, args[1]),
          );
          allocate(n, list.length * 8);
          return list;
        });
      if (k === 'map' || k === 'forEach')
        return native((args) => {
          const result: Value[] = [];
          const len = object.length;
          for (let i = 0; i < len; i++) {
            const v = invoke(args[0], [object[i], i], n);
            if (k === 'map') result.push(v);
          }
          allocate(n, result.length * 8);
          return k === 'map' ? result : undefined;
        });
      return fail(n, `Array method “${k}” is not supported.`);
    }
    if (typeof object === 'string') {
      if (k === 'length') return object.length;
      if (/^(0|[1-9]\d*)$/.test(k)) return object[Number(k)];
      return fail(n, `String property “${k}” is not supported.`);
    }
    if (rawRecord(object)) return Object.hasOwn(object, k) ? object[k] : undefined;
    return fail(n, `Cannot read “${k}” from this value.`);
  }
  function write(object: Value, k: string, value: Value, n: Node) {
    if (Array.isArray(object) && !Object.isFrozen(object) && /^(0|[1-9]\d*)$/.test(k) && Number(k) < 4096) {
      allocate(n, Math.max(1, Number(k) - object.length + 1) * 8);
      object[Number(k)] = value;
      return;
    }
    if (rawRecord(object) && !Object.isFrozen(object)) {
      allocate(n, 8);
      object[k] = value;
      return;
    }
    fail(n, 'Cannot write to this property. API objects and handles are read-only.');
  }
  function prop(n: Node, env: Scope) {
    return key(n, n.computed ? expr(n.property, env) : n.property.name);
  }
  function objectKey(n: Node, env: Scope) {
    return key(n, n.computed ? expr(n.key, env) : (n.key.name ?? n.key.value));
  }
  function spread(value: Value, n: Node) {
    if (!Array.isArray(value)) return fail(n, 'Spread and for-of require an array.');
    tick(n, value.length || 1);
    allocate(n, value.length * 8);
    return value.slice(0, 4096);
  }
  function fn(n: Node, env: Scope) {
    const obj = Object.freeze(Object.create(null) as object);
    allocate(n, 40);
    userFns.set(obj, { node: n, env });
    return obj;
  }
  function invoke(f: Value, args: Value[], n: Node): Value {
    if (args.length > 64) fail(n, 'Function argument limit is 64.');
    if (f && typeof f === 'object') {
      const bridge = functions.get(f);
      if (bridge) {
        tick(n, 10);
        try {
          const result = bridge(args);
          if (Array.isArray(result)) {
            tick(n, result.length || 1);
            allocate(n, result.length * (Object.isFrozen(result) ? 160 : 8));
          }
          return result;
        } catch (e) {
          if (e instanceof ScriptError) throw e;
          return fail(n, e instanceof Error ? e.message : String(e));
        }
      }
      const user = userFns.get(f);
      if (user) {
        if (++depth > 30) fail(n, 'Function call depth limit reached.');
        try {
          const frame = new Scope(user.env);
          const p = user.node;
          if (p.type === 'FunctionExpression' && p.id) frame.declare(p.id.name, f, false, p);
          p.params.forEach((param: Node, i: number) => bind(param, args[i], frame, true));
          if (p.body.type !== 'BlockStatement') return expr(p.body, frame);
          const result = block(p.body.body, frame);
          return result?.type === 'return' ? result.value : undefined;
        } finally {
          depth--;
        }
      }
    }
    return fail(
      n,
      `Unknown function or API command${n.callee?.property?.name ? ` “${n.callee.property.name}”` : ''}.`,
    );
  }
  function bind(n: Node, value: Value, env: Scope, mutable: boolean) {
    tick(n);
    if (n.type === 'Identifier') {
      allocate(n, 10);
      env.declare(n.name, value, mutable, n);
    } else if (n.type === 'AssignmentPattern')
      bind(n.left, value === undefined ? expr(n.right, env) : value, env, mutable);
    else if (n.type === 'ObjectPattern')
      for (const p of n.properties) bind(p.value, read(value, objectKey(p, env), p), env, mutable);
    else if (n.type === 'ArrayPattern')
      n.elements.forEach((p: Node, i: number) => {
        if (p) bind(p, read(value, String(i), p), env, mutable);
      });
    else fail(n, 'Unsupported declaration pattern.');
  }
  function ref(n: Node, env: Scope): { get: () => Value; set: (value: Value) => void } {
    if (n.type === 'Identifier') {
      const c = env.lookup(n.name, n);
      return {
        get: () => c.v,
        set: (value) => {
          if (!c.mutable) fail(n, 'Cannot assign to a const binding.');
          c.v = value;
        },
      };
    }
    if (n.type === 'MemberExpression') {
      const o = expr(n.object, env),
        k = prop(n, env);
      return { get: () => read(o, k, n), set: (value) => write(o, k, value, n) };
    }
    return fail(n, 'Invalid assignment target.');
  }
  function binary(op: string, a: Value, b: Value, n: Node): Value {
    if (op === '===' || op === '==') return a === b;
    if (op === '!==' || op === '!=') return a !== b;
    if (op === '+' && (typeof a === 'string' || typeof b === 'string'))
      return string(n, String(scalar(n, a)) + String(scalar(n, b)));
    if (typeof a === 'string' && typeof b === 'string') {
      if (op === '<') return a < b;
      if (op === '<=') return a <= b;
      if (op === '>') return a > b;
      if (op === '>=') return a >= b;
    }
    const x = number(n, a),
      y = number(n, b);
    switch (op) {
      case '+':
        return number(n, x + y);
      case '-':
        return number(n, x - y);
      case '*':
        return number(n, x * y);
      case '/':
        return number(n, x / y);
      case '%':
        return number(n, x % y);
      case '**':
        return number(n, x ** y);
      case '<':
        return x < y;
      case '<=':
        return x <= y;
      case '>':
        return x > y;
      case '>=':
        return x >= y;
    }
    return fail(n, `Unknown operator ${op}.`);
  }
  function expr(n: Node, env: Scope): Value {
    tick(n);
    switch (n.type) {
      case 'Literal':
        return typeof n.value === 'number'
          ? number(n, n.value)
          : typeof n.value === 'string'
            ? string(n, n.value)
            : n.value;
      case 'Identifier':
        return env.lookup(n.name, n).v;
      case 'ArrayExpression': {
        const a: Value[] = [];
        for (const e of n.elements) {
          if (e?.type === 'SpreadElement') a.push(...spread(expr(e.argument, env), e));
          else a.push(e ? expr(e, env) : undefined);
          if (a.length > 4096) fail(n, 'Array limit is 4096 entries.');
        }
        allocate(n, a.length * 8 + 12);
        return a;
      }
      case 'ObjectExpression': {
        const o = Object.create(null) as Record<string, Value>;
        allocate(n, 12);
        for (const p of n.properties) {
          if (p.type === 'SpreadElement') {
            const src = expr(p.argument, env);
            if (!rawRecord(src)) return fail(p, 'Object spread requires a data object.');
            for (const k of Object.keys(src)) write(o, key(p, k), src[k], p);
          } else write(o, objectKey(p, env), expr(p.value, env), p);
        }
        return o;
      }
      case 'TemplateLiteral': {
        let text = n.quasis[0].value.cooked ?? '';
        for (let i = 0; i < n.expressions.length; i++) {
          text += String(scalar(n, expr(n.expressions[i], env))) + (n.quasis[i + 1].value.cooked ?? '');
          if (text.length > 16384) fail(n, 'String exceeds 16,384 characters.');
        }
        return string(n, text);
      }
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return fn(n, env);
      case 'MemberExpression':
        return read(expr(n.object, env), prop(n, env), n);
      case 'CallExpression': {
        const f = expr(n.callee, env);
        const args: Value[] = [];
        for (const arg of n.arguments)
          if (arg.type === 'SpreadElement') args.push(...spread(expr(arg.argument, env), arg));
          else args.push(expr(arg, env));
        return invoke(f, args, n);
      }
      case 'AwaitExpression':
        return expr(n.argument, env);
      case 'BinaryExpression':
        return binary(n.operator, expr(n.left, env), expr(n.right, env), n);
      case 'LogicalExpression': {
        const a = expr(n.left, env);
        return n.operator === '&&'
          ? a && expr(n.right, env)
          : n.operator === '||'
            ? a || expr(n.right, env)
            : (a ?? expr(n.right, env));
      }
      case 'UnaryExpression': {
        const a = expr(n.argument, env);
        return n.operator === '!'
          ? !a
          : n.operator === 'typeof'
            ? typeof a
            : n.operator === '-'
              ? -number(n, a)
              : number(n, a);
      }
      case 'ConditionalExpression':
        return expr(expr(n.test, env) ? n.consequent : n.alternate, env);
      case 'AssignmentExpression': {
        const r = ref(n.left, env);
        const a = n.operator === '=' ? undefined : r.get(),
          b = expr(n.right, env),
          value = n.operator === '=' ? b : binary(n.operator.slice(0, -1), a, b, n);
        r.set(value);
        return value;
      }
      case 'UpdateExpression': {
        const r = ref(n.argument, env);
        const a = number(n, r.get()),
          b = number(n, a + (n.operator === '++' ? 1 : -1));
        r.set(b);
        return n.prefix ? b : a;
      }
    }
    return fail(n, `Unsupported expression: ${n.type}.`);
  }
  function block(list: Node[], env: Scope) {
    for (const n of list)
      if (n.type === 'FunctionDeclaration') env.declare(n.id.name, fn(n, env), false, n);
    for (const n of list) {
      const j = statement(n, env);
      if (j) return j;
    }
  }
  function statement(n: Node, env: Scope): Jump | undefined {
    tick(n);
    switch (n.type) {
      case 'EmptyStatement':
      case 'FunctionDeclaration':
        return;
      case 'BlockStatement':
        return block(n.body, new Scope(env));
      case 'VariableDeclaration':
        for (const d of n.declarations)
          bind(d.id, d.init ? expr(d.init, env) : undefined, env, n.kind === 'let');
        return;
      case 'ExpressionStatement':
        expr(n.expression, env);
        return;
      case 'ReturnStatement':
        return new Jump('return', n.argument ? expr(n.argument, env) : undefined);
      case 'BreakStatement':
        return new Jump('break');
      case 'ContinueStatement':
        return new Jump('continue');
      case 'IfStatement':
        return expr(n.test, env)
          ? statement(n.consequent, env)
          : n.alternate
            ? statement(n.alternate, env)
            : undefined;
      case 'ForStatement':
      case 'WhileStatement':
      case 'DoWhileStatement': {
        let loop = new Scope(env);
        if (n.init) {
          if (n.init.type === 'VariableDeclaration') statement(n.init, loop);
          else expr(n.init, loop);
        }
        let i = 0;
        while ((n.type === 'DoWhileStatement' && !i) || !n.test || expr(n.test, loop)) {
          if (++i > 10000) fail(n, 'Loop limit is 10,000 iterations.');
          tick(n);
          const j = statement(n.body, loop);
          if (j?.type === 'return') return j;
          if (j?.type === 'break') break;
          if (n.init?.type === 'VariableDeclaration' && loop.cells.size) {
            const next = new Scope(env);
            for (const [k, c] of loop.cells) next.cells.set(k, { ...c });
            loop = next;
          }
          if (n.update) expr(n.update, loop);
        }
        return;
      }
      case 'ForOfStatement': {
        if (n.await) fail(n, 'Use for-of on an array, not for-await-of.');
        for (const item of spread(expr(n.right, env), n)) {
          const loop = new Scope(env);
          if (n.left.type === 'VariableDeclaration')
            bind(n.left.declarations[0].id, item, loop, n.left.kind === 'let');
          else ref(n.left, env).set(item);
          const j = statement(n.body, loop);
          if (j?.type === 'return') return j;
          if (j?.type === 'break') break;
        }
        return;
      }
    }
    return fail(n, `Unsupported statement: ${n.type}.`);
  }
  const globals = new Scope();
  globals.declare('Math', math, false, ast);
  globals.declare('undefined', undefined, false, ast);
  const local = new Scope(globals);
  block(ast.body, local);
  invoke(local.lookup('main', entry).v, [api], entry);
  return steps;
}
