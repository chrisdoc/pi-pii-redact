import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  ExtensionUIContext,
  InputEvent,
  InputEventResult,
  ToolResultEvent,
  ToolResultEventResult,
  ContextEvent,
  ContextEventResult,
  RegisteredCommand,
  AutocompleteItem,
} from "@earendil-works/pi-coding-agent";
import extensionEntry from "../../src/index.js";
import { registerHooks } from "../../src/hooks/index.js";
import { registerPiiCommands } from "../../src/commands/pii.js";
import { RedactorService } from "../../src/services/redactor.js";
import type { RedactorConfig, PiiRule } from "../../src/types.js";

/**
 * Mock UI Context recording notifications and status bar updates.
 */
export class MockExtensionUIContext {
  public statuses: Map<string, string | undefined> = new Map();
  public notifications: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];

  public setStatus(key: string, text: string | undefined): void {
    this.statuses.set(key, text);
  }

  public notify(message: string, type?: "info" | "warning" | "error"): void {
    this.notifications.push({ message, type });
  }

  public getStatus(key: string): string | undefined {
    return this.statuses.get(key);
  }

  public clear(): void {
    this.statuses.clear();
    this.notifications = [];
  }
}

/**
 * Mock ExtensionContext provided to hook and command handlers.
 */
export class MockExtensionContext {
  public ui: MockExtensionUIContext;
  public cwd: string;
  public hasUI: boolean;
  public mode: "tui" | "rpc" | "json" | "print";

  constructor() {
    this.ui = new MockExtensionUIContext();
    this.cwd = process.cwd();
    this.hasUI = true;
    this.mode = "tui";
  }
}

export type HookHandler<TEvent, TResult> = (event: TEvent, ctx: ExtensionContext) => Promise<TResult | undefined> | TResult | undefined;

/**
 * Mock ExtensionAPI simulating the Pi coding agent runtime.
 */
export class MockExtensionAPI {
  public hookHandlers: Map<string, Array<HookHandler<any, any>>> = new Map();
  public commands: Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">> = new Map();

  /** Custom session entries appended via pi.appendEntry, in order. */
  public entries: Array<{ type: "custom"; customType: string; data: unknown }> = [];

  public appendEntry(customType: string, data?: unknown): void {
    this.entries.push({ type: "custom", customType, data });
  }

  public on(event: string, handler: HookHandler<any, any>): () => void {
    if (!this.hookHandlers.has(event)) {
      this.hookHandlers.set(event, []);
    }
    this.hookHandlers.get(event)!.push(handler);
    return () => {
      const list = this.hookHandlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  }

  public registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void {
    this.commands.set(name, options);
  }

  public getHookHandlers(event: string): Array<HookHandler<any, any>> {
    return this.hookHandlers.get(event) || [];
  }

  public getCommand(name: string): Omit<RegisteredCommand, "name" | "sourceInfo"> | undefined {
    return this.commands.get(name);
  }
}

/**
 * Test Harness to initialize pi-pii-redact as an extension or with custom service configurations.
 */
export class PiTestHarness {
  public api: MockExtensionAPI;
  public ctx: MockExtensionContext;
  public redactor?: RedactorService;

  constructor() {
    this.api = new MockExtensionAPI();
    this.ctx = new MockExtensionContext();
  }

  /**
   * Initialize using the default extension entry point (src/index.ts).
   */
  public async initExtension(): Promise<void> {
    extensionEntry(this.api as unknown as ExtensionAPI);
  }

  /**
   * Initialize with custom RedactorService options for advanced configuration testing.
   */
  public initCustomExtension(customRules: PiiRule[] = [], initialConfig?: Partial<RedactorConfig>): RedactorService {
    this.redactor = new RedactorService(customRules, initialConfig);
    registerHooks(this.api as unknown as ExtensionAPI, this.redactor);
    registerPiiCommands(this.api as unknown as ExtensionAPI, this.redactor);
    return this.redactor;
  }

  /**
   * Trigger the session_start hook.
   */
  public async triggerSessionStart(): Promise<void> {
    const handlers = this.api.getHookHandlers("session_start");
    for (const h of handlers) {
      await h({}, this.ctx as unknown as ExtensionContext);
    }
  }

  /**
   * Trigger the input hook with user text.
   */
  public async triggerInput(text: string): Promise<InputEventResult | undefined> {
    const handlers = this.api.getHookHandlers("input");
    let result: InputEventResult | undefined;
    for (const h of handlers) {
      const res = await h({ text } as InputEvent, this.ctx as unknown as ExtensionContext);
      if (res) result = res;
    }
    return result;
  }

  /**
   * Trigger the tool_result hook with tool output items.
   */
  public async triggerToolResult(
    toolName: string,
    content: Array<{ type: string; text?: string; [key: string]: any }>
  ): Promise<ToolResultEventResult | undefined> {
    const handlers = this.api.getHookHandlers("tool_result");
    let result: ToolResultEventResult | undefined;
    for (const h of handlers) {
      const res = await h({ toolName, content } as unknown as ToolResultEvent, this.ctx as unknown as ExtensionContext);
      if (res) result = res;
    }
    return result;
  }

  /**
   * Trigger the context hook with message history.
   */
  public async triggerContext(
    messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; [key: string]: any }> }>
  ): Promise<ContextEventResult | undefined> {
    const handlers = this.api.getHookHandlers("context");
    let result: ContextEventResult | undefined;
    for (const h of handlers) {
      const res = await h({ messages } as unknown as ContextEvent, this.ctx as unknown as ExtensionContext);
      if (res) result = res;
    }
    return result;
  }

  /**
   * Execute a /pii slash command.
   */
  public async executeCommand(args: string): Promise<void> {
    const cmd = this.api.getCommand("pii");
    if (!cmd) {
      throw new Error("Slash command 'pii' is not registered");
    }
    await cmd.handler(args, this.ctx as unknown as ExtensionCommandContext);
  }

  /**
   * Get completions for a prefix in the /pii command.
   */
  public async getCommandCompletions(prefix: string): Promise<AutocompleteItem[]> {
    const cmd = this.api.getCommand("pii");
    if (!cmd || !cmd.getArgumentCompletions) {
      return [];
    }
    const res = cmd.getArgumentCompletions(prefix);
    return Promise.resolve(res);
  }
}

// Verification matchers for expected redactions
export function assertRedactedEmail(text: string, original?: string) {
  if (original) {
    if (text.includes(original)) {
      throw new Error(`Expected text to NOT contain original email "${original}", but found in: "${text}"`);
    }
  }
  const match = text.match(/\[(?:REDACTED:EMAIL|EMAIL(?:_\d+(?:#[a-z0-9]{4})?)?)\]/i);
  if (!match) {
    throw new Error(`Expected text to contain redacted email placeholder, but got: "${text}"`);
  }
}

export function assertRedactedApiKey(text: string, original?: string) {
  if (original) {
    if (text.includes(original)) {
      throw new Error(`Expected text to NOT contain original API key "${original}", but found in: "${text}"`);
    }
  }
  const match = text.match(/\[(?:REDACTED:API_KEY|API_KEY(?:_\d+(?:#[a-z0-9]{4})?)?)\]/i);
  if (!match) {
    throw new Error(`Expected text to contain redacted API key placeholder, but got: "${text}"`);
  }
}

export function assertRedactedIp(text: string, original?: string) {
  if (original) {
    if (text.includes(original)) {
      throw new Error(`Expected text to NOT contain original IP "${original}", but found in: "${text}"`);
    }
  }
  const match = text.match(/\[(?:REDACTED:IP_ADDRESS|IP_ADDRESS(?:_\d+(?:#[a-z0-9]{4})?)?)\]/i);
  if (!match) {
    throw new Error(`Expected text to contain redacted IP placeholder, but got: "${text}"`);
  }
}

export function assertRedactedPhone(text: string, original?: string) {
  if (original) {
    if (text.includes(original)) {
      throw new Error(`Expected text to NOT contain original phone "${original}", but found in: "${text}"`);
    }
  }
  const match = text.match(/\[(?:REDACTED:PHONE|PHONE(?:_\d+(?:#[a-z0-9]{4})?)?)\]/i);
  if (!match) {
    throw new Error(`Expected text to contain redacted phone placeholder, but got: "${text}"`);
  }
}

export function assertRedactedCreditCard(text: string, original?: string) {
  if (original) {
    if (text.includes(original)) {
      throw new Error(`Expected text to NOT contain original credit card "${original}", but found in: "${text}"`);
    }
  }
  const match = text.match(/\[(?:REDACTED:CREDIT_CARD|CREDIT_CARD(?:_\d+(?:#[a-z0-9]{4})?)?)\]/i);
  if (!match) {
    throw new Error(`Expected text to contain redacted credit card placeholder, but got: "${text}"`);
  }
}
