import { vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import type { RedactorService } from "../src/services/redactor.js";
import type { RedactorConfig, RedactionResult, PiiRule } from "../src/types.js";

export type HookHandler<TEvent = any, TResult = any> = (
  event: TEvent,
  ctx?: ExtensionContext
) => Promise<TResult | undefined> | TResult | undefined;

export interface RegisteredCommandEntry {
  description: string;
  getArgumentCompletions?: (
    prefix: string
  ) => Array<{ value: string; label: string }> | Promise<Array<{ value: string; label: string }>>;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

export interface MockContextFixture {
  ctx: ExtensionContext & ExtensionCommandContext;
  setStatusSpy: ReturnType<typeof vi.fn>;
  notifySpy: ReturnType<typeof vi.fn>;
  notifications: Array<{ message: string; type?: string }>;
  statuses: Map<string, string | undefined>;
}

export interface MockExtensionAPIFixture {
  api: ExtensionAPI;
  onSpy: ReturnType<typeof vi.fn>;
  registerCommandSpy: ReturnType<typeof vi.fn>;
  handlers: Map<string, Array<HookHandler>>;
  commands: Map<string, RegisteredCommandEntry>;
  getHandler: (event: string, index?: number) => HookHandler | undefined;
  getCommand: (name: string) => RegisteredCommandEntry | undefined;
  trigger: <TEvent = any, TResult = any>(
    event: string,
    eventPayload?: TEvent,
    ctx?: ExtensionContext
  ) => Promise<TResult | undefined>;
  triggerHook: <TEvent = any, TResult = any>(
    event: string,
    eventPayload?: TEvent,
    ctx?: ExtensionContext
  ) => Promise<TResult | undefined>;
  executeCommand: (
    name: string,
    args: string,
    ctx?: ExtensionCommandContext
  ) => Promise<void>;
  getArgumentCompletions: (
    name: string,
    prefix: string
  ) => Promise<Array<{ value: string; label: string }>>;
  getCompletions: (
    name: string,
    prefix: string
  ) => Array<{ value: string; label: string }>;
  clear: () => void;
}

export interface MockRedactorFixture {
  redactor: RedactorService;
  isEnabledSpy: ReturnType<typeof vi.fn>;
  setEnabledSpy: ReturnType<typeof vi.fn>;
  getConfigSpy: ReturnType<typeof vi.fn>;
  redactSpy: ReturnType<typeof vi.fn>;
  getRulesSpy: ReturnType<typeof vi.fn>;
  rulesList: PiiRule[];
}

/**
 * Factory for Mock Context with configurable UI behavior.
 * Supports testing headless, missing UI, and missing method scenarios.
 */
export function createMockContext(options?: {
  headless?: boolean;
  noUi?: boolean;
  missingSetStatus?: boolean;
  missingNotify?: boolean;
}): MockContextFixture {
  const notifications: Array<{ message: string; type?: string }> = [];
  const statuses = new Map<string, string | undefined>();

  const setStatusSpy = vi.fn((key: string, text: string | undefined) => {
    statuses.set(key, text);
  });

  const notifySpy = vi.fn((message: string, type?: string) => {
    notifications.push({ message, type });
  });

  if (options?.noUi) {
    return {
      ctx: {} as any,
      setStatusSpy,
      notifySpy,
      notifications,
      statuses,
    };
  }

  if (options?.headless) {
    return {
      ctx: {
        ui: undefined,
        cwd: "/mock/cwd",
        hasUI: false,
        mode: "rpc",
      } as any,
      setStatusSpy,
      notifySpy,
      notifications,
      statuses,
    };
  }

  const uiObj: Record<string, any> = {};
  if (!options?.missingSetStatus) {
    uiObj.setStatus = setStatusSpy;
  }
  if (!options?.missingNotify) {
    uiObj.notify = notifySpy;
  }

  const ctx = {
    ui: uiObj,
    cwd: "/mock/cwd",
    hasUI: true,
    mode: "tui",
  } as unknown as ExtensionContext & ExtensionCommandContext;

  return { ctx, setStatusSpy, notifySpy, notifications, statuses };
}

export const createMockCommandContext = createMockContext;

/**
 * Factory for Mock ExtensionAPI supporting both lifecycle hooks and slash commands.
 */
export function createMockExtensionAPI(): MockExtensionAPIFixture {
  const handlers = new Map<string, Array<HookHandler>>();
  const commands = new Map<string, RegisteredCommandEntry>();

  const onSpy = vi.fn((event: string, handler: HookHandler) => {
    if (!handlers.has(event)) {
      handlers.set(event, []);
    }
    handlers.get(event)!.push(handler);
    return () => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  });

  const registerCommandSpy = vi.fn(
    (name: string, options: RegisteredCommandEntry) => {
      commands.set(name, options);
    }
  );

  const api = {
    on: onSpy,
    registerCommand: registerCommandSpy,
  } as unknown as ExtensionAPI;

  const trigger = async <TEvent = any, TResult = any>(
    event: string,
    eventPayload?: TEvent,
    ctx?: ExtensionContext
  ): Promise<TResult | undefined> => {
    const list = handlers.get(event) || [];
    let result: any;
    for (const handler of list) {
      result = await handler(eventPayload, ctx);
    }
    return result;
  };

  const executeCommand = async (
    name: string,
    args: string,
    ctx?: ExtensionCommandContext
  ): Promise<void> => {
    const cmd = commands.get(name);
    if (!cmd) {
      throw new Error(`Command "${name}" not registered`);
    }
    const defaultCtx = ctx ?? createMockContext().ctx;
    await cmd.handler(args, defaultCtx);
  };

  const getCompletions = (
    name: string,
    prefix: string
  ): Array<{ value: string; label: string }> => {
    const cmd = commands.get(name);
    if (!cmd || !cmd.getArgumentCompletions) {
      return [];
    }
    const res = cmd.getArgumentCompletions(prefix);
    return (res as any) || [];
  };

  const getArgumentCompletions = async (
    name: string,
    prefix: string
  ): Promise<Array<{ value: string; label: string }>> => {
    return getCompletions(name, prefix);
  };

  const clear = () => {
    handlers.clear();
    commands.clear();
    onSpy.mockClear();
    registerCommandSpy.mockClear();
  };

  return {
    api,
    onSpy,
    registerCommandSpy,
    handlers,
    commands,
    getHandler: (event: string, index = 0) => handlers.get(event)?.[index],
    getCommand: (name: string) => commands.get(name),
    trigger,
    triggerHook: trigger,
    executeCommand,
    getCompletions,
    getArgumentCompletions,
    clear,
  };
}

/**
 * Factory for Mock RedactorService for fast, isolated unit testing without ML weights.
 */
export function createMockRedactor(options?: {
  enabled?: boolean;
  config?: Partial<RedactorConfig>;
  redactImpl?: (text: string) => Promise<RedactionResult>;
  rules?: PiiRule[];
}): MockRedactorFixture {
  let enabled = options?.enabled ?? true;
  const isEnabledSpy = vi.fn(() => enabled);
  const setEnabledSpy = vi.fn((val: boolean) => {
    enabled = val;
  });

  const currentConfig: RedactorConfig = {
    enabled,
    maskUserInputs: true,
    maskToolResults: true,
    maskContextMessages: true,
    notifyOnRedact: true,
    ...options?.config,
  };
  const getConfigSpy = vi.fn(() => currentConfig);

  const redactSpy = vi.fn().mockImplementation(
    options?.redactImpl ??
      (async (text: string): Promise<RedactionResult> => ({
        text,
        hasRedactions: false,
        count: 0,
        redactions: [],
        restore: (t: string) => t,
      }))
  );

  const rulesList: PiiRule[] = options?.rules
    ? [...options.rules]
    : [
        { id: "email", name: "Email Addresses", category: "email", enabled: true },
        { id: "api-key-generic", name: "Common API Keys & Tokens", category: "api-key", enabled: true },
        { id: "ip-address", name: "IP Addresses", category: "ip-address", enabled: true },
        { id: "phone-us", name: "Phone Numbers", category: "phone", enabled: true },
        { id: "credit-card", name: "Credit Card Numbers", category: "credit-card", enabled: true },
      ];
  const getRulesSpy = vi.fn(() => rulesList);

  const redactor = {
    isEnabled: isEnabledSpy,
    setEnabled: setEnabledSpy,
    getConfig: getConfigSpy,
    redact: redactSpy,
    getRules: getRulesSpy,
  } as unknown as RedactorService;

  return {
    redactor,
    isEnabledSpy,
    setEnabledSpy,
    getConfigSpy,
    redactSpy,
    getRulesSpy,
    rulesList,
  };
}

export const createMockRedactorService = createMockRedactor;
