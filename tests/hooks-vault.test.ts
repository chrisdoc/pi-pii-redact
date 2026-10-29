import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  compact: vi.fn(),
  generateBranchSummary: vi.fn(),
}));

import { compact, generateBranchSummary } from "@earendil-works/pi-coding-agent";
import { registerHooks } from "../src/hooks/index.js";
import { registerPiiCommands } from "../src/commands/pii.js";
import { RedactorService } from "../src/services/redactor.js";
import { createMockContext, createMockExtensionAPI } from "./mock-pi.js";

const NAMES = ["Alice", "Bob"];

/** Fake native engine: flags the configured first names as GIVEN_NAME. */
function nameEngine() {
  return {
    dispose: () => {},
    redaction: async (text: string) => {
      const items: any[] = [];
      for (const name of NAMES) {
        for (const m of text.matchAll(new RegExp(`\\b${name}\\b`, "g"))) {
          items.push({
            label: "GIVEN_NAME",
            original: name,
            placeholder: "[GIVEN_NAME_1]",
            confidence: 0.99,
            start: m.index!,
            end: m.index! + name.length,
          });
        }
      }
      return { redactedText: text, items, restore: (t: string) => t };
    },
  };
}

const TOKEN = (label: string) => new RegExp(`\\[${label}_\\d+#[a-z0-9]{4}\\]`);
const tokenIn = (text: string, label: string) => text.match(TOKEN(label))![0];

function setup(opts: { entries?: any[]; model?: unknown; auth?: any } = {}) {
  const redactor = new RedactorService([], {}, { redactInstance: nameEngine() as any });
  const mock = createMockExtensionAPI();
  if (opts.entries) mock.entries.push(...opts.entries);
  registerHooks(mock.api, redactor);
  registerPiiCommands(mock.api, redactor);
  const fx = createMockContext({ entries: mock.entries, model: opts.model ?? { id: "test-model" }, auth: opts.auth });
  return { redactor, mock, ...fx };
}

beforeEach(() => {
  vi.mocked(compact).mockReset();
  vi.mocked(generateBranchSummary).mockReset();
});

describe("full loop", () => {
  it("input -> context tokens -> message_end restore -> tool_call restore -> context re-redacts", async () => {
    const { mock, ctx } = setup();
    await mock.trigger("session_start", {}, ctx);

    const input = await mock.trigger("input", { text: "I am Alice, mail alice@example.com" }, ctx);
    expect(input.action).toBe("transform");
    const nameTok = tokenIn(input.text, "GIVEN_NAME");
    const mailTok = tokenIn(input.text, "EMAIL");
    expect(input.text).not.toMatch(/Alice|alice@/);

    const ctxRes1 = await mock.trigger("context", { messages: [{ role: "user", content: "I am Alice, mail alice@example.com" }] }, ctx);
    expect(ctxRes1.messages[0].content).toBe(input.text);

    // Model replies with a canonical name token and a mangled email token (lowercase, no brackets)
    const mangled = mailTok.slice(1, -1).toLowerCase();
    const thinking = { type: "thinking", thinking: `pondering ${nameTok}`, thinkingSignature: "sig==" };
    const assistant = {
      role: "assistant",
      content: [thinking, { type: "text", text: `Hello ${nameTok}, I will edit for ${mangled}.` }],
    };
    const ended = await mock.trigger("message_end", { message: assistant }, ctx);
    expect(ended.message.content[1].text).toBe("Hello Alice, I will edit for alice@example.com.");
    expect(ended.message.content[0]).toBe(thinking);
    expect(JSON.stringify(ended.message.content[0])).toBe(JSON.stringify(thinking));

    // Tool call with nested arguments is restored in place
    const edits = [{ oldText: `contact ${mailTok}` }];
    const input2 = { path: "a.txt", edits };
    const callEvent = { toolName: "edit", toolCallId: "1", input: input2 };
    await mock.trigger("tool_call", callEvent, ctx);
    expect(callEvent.input).toBe(input2);
    expect(input2.edits).toBe(edits);
    expect(edits[0].oldText).toBe("contact alice@example.com");

    // Next context pass re-redacts the stored plaintext assistant message to the same tokens
    const ctxRes2 = await mock.trigger("context", { messages: [{ role: "user", content: input.text }, ended.message] }, ctx);
    const redacted = ctxRes2.messages[1];
    expect(redacted.content[1].text).toBe(`Hello ${nameTok}, I will edit for ${mailTok}.`);
    expect(redacted.content[0]).toBe(thinking);
  });

  it("restores tool_call arguments even while redaction is disabled", async () => {
    const { mock, ctx, redactor } = setup();
    const input = await mock.trigger("input", { text: "mail alice@example.com" }, ctx);
    const tok = tokenIn(input.text, "EMAIL");
    redactor.setEnabled(false);
    const event = { toolName: "bash", input: { command: `echo ${tok}` } };
    await mock.trigger("tool_call", event, ctx);
    expect(event.input.command).toBe("echo alice@example.com");
  });

  it("gives two people distinct tokens across separate messages", async () => {
    const { mock, ctx } = setup();
    const res = await mock.trigger(
      "context",
      { messages: [{ role: "user", content: "Alice here" }, { role: "user", content: "Bob here" }, { role: "user", content: "Alice again" }] },
      ctx
    );
    const [a, b, a2] = res.messages.map((m: any) => tokenIn(m.content, "GIVEN_NAME"));
    expect(a).not.toBe(b);
    expect(a2).toBe(a);
  });
});

describe("context walker", () => {
  it("redacts bash output/command, summaries and toolCall args; leaves thinking and inputs untouched", async () => {
    const { mock, ctx } = setup();
    const thinking = { type: "thinking", thinking: "alice@example.com secret thought", thinkingSignature: "sig" };
    const messages = [
      { role: "bashExecution", command: "mail alice@example.com", output: "sent to alice@example.com", exitCode: 0 },
      { role: "bashExecution", command: "mail bob@example.com", output: "bob@example.com", excludeFromContext: true },
      { role: "compactionSummary", summary: "User Alice, alice@example.com" },
      { role: "branchSummary", summary: "Branch about bob@example.com" },
      {
        role: "assistant",
        content: [thinking, { type: "toolCall", id: "t1", name: "edit", arguments: { path: "x", edits: [{ oldText: "alice@example.com" }] } }],
      },
      { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "alice@example.com" }, { type: "image", data: "AAA", mimeType: "image/png" }] },
      { role: "custom", customType: "x", content: "note for alice@example.com" },
    ];
    const snapshot = JSON.stringify(messages);
    const res = await mock.trigger("context", { messages }, ctx);

    expect(JSON.stringify(messages)).toBe(snapshot); // inputs not mutated
    const out = res.messages;
    expect(out[0].command).toMatch(TOKEN("EMAIL"));
    expect(out[0].output).toMatch(TOKEN("EMAIL"));
    expect(out[1]).toBe(messages[1]); // excludeFromContext is skipped
    expect(out[2].summary).toMatch(TOKEN("GIVEN_NAME"));
    expect(out[2].summary).toMatch(TOKEN("EMAIL"));
    expect(out[3].summary).toMatch(TOKEN("EMAIL"));
    expect(out[4].content[0]).toBe(thinking);
    expect(out[4].content[1].arguments.edits[0].oldText).toMatch(/^\[EMAIL_\d+#[a-z0-9]{4}\]$/);
    expect(out[5].content[0].text).toMatch(TOKEN("EMAIL"));
    expect(out[5].content[1]).toBe(messages[5].content[1]);
    expect(out[6].content).toMatch(TOKEN("EMAIL"));
    expect(JSON.stringify(out.filter((_: unknown, i: number) => i !== 4))).not.toContain("alice@example.com");
    expect(JSON.stringify(out[4].content[1])).not.toContain("alice@example.com");
  });

  it("returns undefined when nothing needs redaction", async () => {
    const { mock, ctx } = setup();
    expect(await mock.trigger("context", { messages: [{ role: "user", content: "hello" }] }, ctx)).toBeUndefined();
  });
});

describe("tool_result", () => {
  it("redacts structuredContent and returns it alongside content", async () => {
    const { mock, ctx } = setup();
    const res = await mock.trigger(
      "tool_result",
      {
        toolName: "query",
        content: [{ type: "text", text: "found alice@example.com" }],
        structuredContent: { rows: [{ email: "alice@example.com", n: 1 }], note: "ok" },
      },
      ctx
    );
    expect(res.content[0].text).toMatch(TOKEN("EMAIL"));
    expect(res.structuredContent.rows[0].email).toMatch(TOKEN("EMAIL"));
    expect(res.structuredContent.rows[0].n).toBe(1);
    expect(res.structuredContent.note).toBe("ok");
  });

  it("still returns unchanged structuredContent when content changes", async () => {
    const { mock, ctx } = setup();
    const res = await mock.trigger(
      "tool_result",
      { content: [{ type: "text", text: "alice@example.com" }], structuredContent: { ok: true } },
      ctx
    );
    expect(res.structuredContent).toEqual({ ok: true });
  });
});

describe("vault persistence", () => {
  it("appends only new vault entries and rebuilds on session_start without reusing numbers", async () => {
    const first = setup();
    await first.mock.trigger("session_start", {}, first.ctx);
    const r1 = await first.mock.trigger("input", { text: "mail alice@example.com" }, first.ctx);
    const aliceTok = tokenIn(r1.text, "EMAIL");
    await first.mock.trigger("context", { messages: [{ role: "user", content: "mail alice@example.com" }] }, first.ctx);
    const vaultEntries = () => first.mock.entries.filter((e) => e.customType === "pii-vault");
    expect(vaultEntries()).toHaveLength(1); // second pass minted nothing new
    expect(vaultEntries()[0].data.v).toBe(1);

    // Reload: a fresh service over the same session entries
    const second = setup({ entries: first.mock.entries });
    await second.mock.trigger("session_start", {}, second.ctx);
    const ended = await second.mock.trigger(
      "message_end",
      { message: { role: "assistant", content: [{ type: "text", text: `ping ${aliceTok}` }] } },
      second.ctx
    );
    expect(ended.message.content[0].text).toBe("ping alice@example.com");
    const r2 = await second.mock.trigger("input", { text: "also bob@example.com" }, second.ctx);
    expect(tokenIn(r2.text, "EMAIL")).toMatch(/^\[EMAIL_2#/);
    expect(tokenIn(r2.text, "EMAIL").split("#")[1]).toBe(aliceTok.split("#")[1]);
  });

  it("a session with no vault entries gets a fresh vault", async () => {
    const { mock, ctx, redactor } = setup();
    await redactor.redact("alice@example.com");
    expect(redactor.getVault().size).toBe(1);
    await mock.trigger("session_start", {}, ctx);
    expect(redactor.getVault().size).toBe(0);
  });
});

describe("config persistence and lifecycle", () => {
  it("persists /pii enable/disable/toggle and applies the latest on session_start", async () => {
    const first = setup();
    await first.mock.executeCommand("pii", "disable", first.ctx as any);
    expect(first.mock.entries.at(-1)).toMatchObject({ customType: "pii-config", data: { enabled: false } });
    await first.mock.executeCommand("pii", "toggle", first.ctx as any);
    expect(first.mock.entries.at(-1)!.data.enabled).toBe(true);
    await first.mock.executeCommand("pii", "disable", first.ctx as any);

    const second = setup({ entries: first.mock.entries });
    expect(second.redactor.isEnabled()).toBe(true);
    await second.mock.trigger("session_start", {}, second.ctx);
    expect(second.redactor.isEnabled()).toBe(false);
    expect(second.setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");
  });

  it("restores disabled rules from the persisted snapshot", async () => {
    const entries = [{ type: "custom", customType: "pii-config", data: { enabled: true, disabledRules: ["email", "org"] } }];
    const { mock, ctx, redactor } = setup({ entries });
    await mock.trigger("session_start", {}, ctx);
    expect(redactor.getRules().find((r) => r.id === "email")!.enabled).toBe(false);
    expect(redactor.getRules().find((r) => r.id === "phone")!.enabled).toBe(true);
  });

  it("ignores malformed disabled rule entries while restoring valid strings", async () => {
    const disabledRules = [null, 42, false, {}, ["phone"], "email", "date", "PASSPORT", "DRIVERS_LICENSE", "TAX_ID"];
    const entries = [{ type: "custom", customType: "pii-config", data: { enabled: false, disabledRules } }];
    const { mock, ctx, redactor } = setup({ entries });
    await expect(mock.trigger("session_start", {}, ctx)).resolves.not.toThrow();
    expect(redactor.isEnabled()).toBe(false);
    for (const id of ["email", "date", "government-id"]) {
      expect(redactor.getRules().find((r) => r.id === id)!.enabled).toBe(false);
    }
    expect(redactor.getRules().find((r) => r.id === "phone")!.enabled).toBe(true);
  });

  it("disposes the redactor on session_shutdown but keeps the vault", async () => {
    const { mock, ctx, redactor } = setup();
    const spy = vi.spyOn(redactor, "dispose");
    await redactor.redact("alice@example.com");
    await mock.trigger("session_shutdown", { reason: "quit" }, ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(redactor.getVault().size).toBe(1);
  });
});

describe("compaction", () => {
  const prep = () => ({
    firstKeptEntryId: "e5",
    messagesToSummarize: [{ role: "user", content: "I am Alice, alice@example.com" }],
    turnPrefixMessages: [{ role: "bashExecution", command: "ls", output: "bob@example.com" }],
    isSplitTurn: false,
    tokensBefore: 1000,
    previousSummary: "Earlier: Bob at bob@example.com",
    fileOps: {},
    settings: {},
  });

  it("sends only redacted data to compact() and returns a plaintext summary", async () => {
    const { mock, ctx, redactor } = setup();
    vi.mocked(compact).mockImplementation(async (p: any) => {
      const sent = JSON.stringify(p);
      expect(sent).not.toMatch(/Alice|alice@|Bob|bob@/);
      const email = tokenIn(p.messagesToSummarize[0].content, "EMAIL");
      return { summary: `User wrote from ${email}`, firstKeptEntryId: p.firstKeptEntryId, tokensBefore: p.tokensBefore } as any;
    });
    const res = await mock.trigger(
      "session_before_compact",
      { preparation: prep(), branchEntries: [], customInstructions: "focus on alice@example.com", signal: new AbortController().signal },
      ctx
    );
    expect(compact).toHaveBeenCalledTimes(1);
    const args = vi.mocked(compact).mock.calls[0];
    expect(args[2]).toBe("test-key");
    expect(args[4]).not.toContain("alice@example.com");
    expect(res.compaction.summary).toBe("User wrote from alice@example.com");
    expect(res.compaction.firstKeptEntryId).toBe("e5");
    expect(mock.entries.some((e) => e.customType === "pii-vault")).toBe(true);
    expect(redactor.getVault().size).toBeGreaterThan(0);
  });

  it("cancels (never falls back) when compact throws, auth fails, or there is no model", async () => {
    const a = setup();
    vi.mocked(compact).mockRejectedValue(new Error("boom"));
    const r1 = await a.mock.trigger("session_before_compact", { preparation: prep(), signal: new AbortController().signal }, a.ctx);
    expect(r1).toEqual({ cancel: true });
    expect(a.notifications.some((n) => n.type === "error" && n.message.includes("boom"))).toBe(true);

    const b = setup({ auth: { ok: false, error: "no key" } });
    vi.mocked(compact).mockClear();
    const r2 = await b.mock.trigger("session_before_compact", { preparation: prep(), signal: new AbortController().signal }, b.ctx);
    expect(r2).toEqual({ cancel: true });
    expect(compact).not.toHaveBeenCalled();
    expect(b.notifications.some((n) => n.type === "error")).toBe(true);

    const c = setup();
    (c.ctx as any).model = undefined;
    const r3 = await c.mock.trigger("session_before_compact", { preparation: prep(), signal: new AbortController().signal }, c.ctx);
    expect(r3).toEqual({ cancel: true });
    expect(compact).not.toHaveBeenCalled();
  });

  it("cancels silently when aborted", async () => {
    const { mock, ctx, notifications } = setup();
    const ac = new AbortController();
    vi.mocked(compact).mockImplementation(async () => {
      ac.abort();
      throw new Error("aborted");
    });
    const res = await mock.trigger("session_before_compact", { preparation: prep(), signal: ac.signal }, ctx);
    expect(res).toEqual({ cancel: true });
    expect(notifications.filter((n) => n.type === "error")).toHaveLength(0);
  });

  it("leaves compaction to Pi when redaction is disabled", async () => {
    const { mock, ctx, redactor } = setup();
    redactor.setEnabled(false);
    expect(await mock.trigger("session_before_compact", { preparation: prep(), signal: new AbortController().signal }, ctx)).toBeUndefined();
    expect(compact).not.toHaveBeenCalled();
  });
});

describe("branch summaries", () => {
  const treeEvent = (over: any = {}) => ({
    preparation: {
      targetId: "t",
      oldLeafId: "o",
      commonAncestorId: "c",
      userWantsSummary: true,
      customInstructions: "mention bob@example.com",
      entriesToSummarize: [
        { type: "message", id: "1", message: { role: "user", content: "Alice alice@example.com" } },
        { type: "compaction", id: "2", summary: "bob@example.com earlier" },
        { type: "branch_summary", id: "3", summary: "Alice branch" },
        { type: "label", id: "4", targetId: "1" },
      ],
      ...over,
    },
    signal: new AbortController().signal,
  });

  it("summarizes redacted entries and returns a plaintext summary", async () => {
    const { mock, ctx } = setup();
    vi.mocked(generateBranchSummary).mockImplementation(async (entries: any[], opts: any) => {
      expect(JSON.stringify([entries, opts.customInstructions])).not.toMatch(/Alice|alice@|bob@/);
      expect(entries[3]).toEqual({ type: "label", id: "4", targetId: "1" });
      return { summary: `About ${tokenIn(entries[0].message.content, "EMAIL")}`, readFiles: ["r"], modifiedFiles: [] } as any;
    });
    const res = await mock.trigger("session_before_tree", treeEvent(), ctx);
    expect(res.summary.summary).toBe("About alice@example.com");
    expect(res.summary.details).toEqual({ readFiles: ["r"], modifiedFiles: [] });
    expect(mock.entries.some((e) => e.customType === "pii-vault")).toBe(true);
  });

  it("does nothing when the user does not want a summary", async () => {
    const { mock, ctx } = setup();
    expect(await mock.trigger("session_before_tree", treeEvent({ userWantsSummary: false }), ctx)).toBeUndefined();
    expect(generateBranchSummary).not.toHaveBeenCalled();
  });

  it("cancels with a notification on failure or an error result", async () => {
    const { mock, ctx, notifications } = setup();
    vi.mocked(generateBranchSummary).mockRejectedValue(new Error("down"));
    expect(await mock.trigger("session_before_tree", treeEvent(), ctx)).toEqual({ cancel: true });
    vi.mocked(generateBranchSummary).mockResolvedValue({ error: "bad" } as any);
    expect(await mock.trigger("session_before_tree", treeEvent(), ctx)).toEqual({ cancel: true });
    expect(notifications.filter((n) => n.type === "error")).toHaveLength(2);
  });
});
