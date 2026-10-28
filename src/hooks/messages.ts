/**
 * Deep message walkers used by the hooks. All mapping helpers return the original
 * reference when nothing changed and never mutate their input.
 */

export type TextMapper = (text: string) => Promise<string>;

const MAX_DEPTH = 64;

/** Applies `fn` to every string value (not keys) nested in arrays/plain objects. Returns a copy only if changed. */
export async function mapStringsDeep<T>(value: T, fn: TextMapper, depth = 0): Promise<T> {
  if (typeof value === "string") {
    return (await fn(value)) as unknown as T;
  }
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    let out: unknown[] | null = null;
    for (let i = 0; i < value.length; i++) {
      const next = await mapStringsDeep(value[i], fn, depth + 1);
      if (next !== value[i]) {
        out ??= value.slice();
        out[i] = next;
      }
    }
    return (out ?? value) as unknown as T;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }
  let out: Record<string, unknown> | null = null;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const current = (value as Record<string, unknown>)[key];
    const next = await mapStringsDeep(current, fn, depth + 1);
    if (next !== current) {
      out ??= { ...(value as Record<string, unknown>) };
      out[key] = next;
    }
  }
  return (out ?? value) as T;
}

/** Restores every string nested in `value` in place, keeping the existing objects. Returns true if anything changed. */
export function restoreStringsInPlace(
  value: unknown,
  restore: (text: string) => string,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): boolean {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  let changed = false;
  const container = value as Record<string, unknown>;
  for (const key of Object.keys(container)) {
    const current = container[key];
    if (typeof current === "string") {
      const next = restore(current);
      if (next !== current) {
        container[key] = next;
        changed = true;
      }
    } else if (restoreStringsInPlace(current, restore, depth + 1, seen)) {
      changed = true;
    }
  }
  return changed;
}

/** Maps string content or the text blocks of a block array. Other blocks (images, ...) are untouched. */
export async function mapContent(content: unknown, fn: TextMapper): Promise<unknown> {
  if (typeof content === "string") return fn(content);
  if (!Array.isArray(content)) return content;
  let out: unknown[] | null = null;
  for (let i = 0; i < content.length; i++) {
    const block = content[i] as any;
    if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      const text = await fn(block.text);
      if (text !== block.text) {
        out ??= content.slice();
        out[i] = { ...block, text };
      }
    }
  }
  return out ?? content;
}

/** Maps assistant content: text blocks and toolCall arguments. Thinking (and every other block) is never touched. */
export async function mapAssistantContent(content: unknown, fn: TextMapper): Promise<unknown> {
  if (typeof content === "string") return fn(content);
  if (!Array.isArray(content)) return content;
  let out: unknown[] | null = null;
  for (let i = 0; i < content.length; i++) {
    const block = content[i] as any;
    if (!block || typeof block !== "object") continue;
    let next = block;
    if (block.type === "text" && typeof block.text === "string") {
      const text = await fn(block.text);
      if (text !== block.text) next = { ...block, text };
    } else if (block.type === "toolCall" && block.arguments && typeof block.arguments === "object") {
      const args = await mapStringsDeep(block.arguments, fn);
      if (args !== block.arguments) next = { ...block, arguments: args };
    }
    if (next !== block) {
      out ??= content.slice();
      out[i] = next;
    }
  }
  return out ?? content;
}

async function withField<T extends Record<string, any>>(
  msg: T,
  field: string,
  mapper: (v: unknown) => Promise<unknown>,
  extra?: T
): Promise<T> {
  const base = extra ?? msg;
  const next = await mapper(base[field]);
  return next === base[field] ? base : ({ ...base, [field]: next } as T);
}

/**
 * Maps all model-visible text of an AgentMessage. Returns the same reference when unchanged,
 * otherwise a copy. The input is never mutated.
 */
export async function mapMessage<T>(message: T, fn: TextMapper): Promise<T> {
  const msg = message as any;
  if (!msg || typeof msg !== "object") return message;

  switch (msg.role) {
    case "assistant":
      return withField(msg, "content", (c) => mapAssistantContent(c, fn));
    case "bashExecution": {
      if (msg.excludeFromContext) return message;
      let out = msg;
      if (typeof out.output === "string") out = await withField(msg, "output", (v) => mapStringsDeep(v, fn), out);
      if (typeof out.command === "string") out = await withField(msg, "command", (v) => mapStringsDeep(v, fn), out);
      return out;
    }
    case "compactionSummary":
    case "branchSummary":
      return withField(msg, "summary", (v) => mapStringsDeep(v, fn));
    default:
      if (typeof msg.content === "string" || Array.isArray(msg.content)) {
        return withField(msg, "content", (c) => mapContent(c, fn));
      }
      return message;
  }
}

/** Maps messages sequentially (deterministic token minting order). */
export async function mapMessages<T>(messages: T[], fn: TextMapper): Promise<{ messages: T[]; changed: boolean }> {
  const out: T[] = [];
  let changed = false;
  for (const m of messages) {
    const next = await mapMessage(m, fn);
    if (next !== m) changed = true;
    out.push(next);
  }
  return { messages: out, changed };
}

/** Restores assistant content (text blocks, toolCall arguments) via `restore`. Thinking is untouched. */
export async function restoreAssistantMessage<T>(message: T, restore: (text: string) => string): Promise<T> {
  const msg = message as any;
  if (!msg || typeof msg !== "object" || msg.role !== "assistant") return message;
  return mapMessage(message, async (s) => restore(s));
}

/** Maps the model-visible text of a session entry (used for branch summaries). */
export async function mapSessionEntry<T>(entry: T, fn: TextMapper): Promise<T> {
  const e = entry as any;
  if (!e || typeof e !== "object") return entry;
  switch (e.type) {
    case "message":
      return withField(e, "message", (m) => mapMessage(m, fn));
    case "compaction":
    case "branch_summary":
      return withField(e, "summary", (v) => mapStringsDeep(v, fn));
    case "custom_message":
      return withField(e, "content", (c) => mapContent(c, fn));
    default:
      return entry;
  }
}
