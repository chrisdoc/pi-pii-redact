import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { registerPiiCommands } from "../src/commands/pii.js";
import { RedactorService } from "../src/services/redactor.js";
import type { PiiRule } from "../src/types.js";
import {
  createMockExtensionAPI,
  createMockCommandContext,
  createMockRedactorService,
  type MockExtensionAPIFixture,
  type MockContextFixture,
  type MockRedactorFixture,
} from "./mock-pi.js";

describe("registerPiiCommands - Dedicated Component Unit Tests", () => {
  // ==========================================================================
  // Suite 1: Command Registration & Metadata
  // ==========================================================================
  describe("1. Command Registration & Metadata", () => {
    it("1.1 registers command named 'pii'", () => {
      const { api, registerCommandSpy, commands } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(registerCommandSpy).toHaveBeenCalledTimes(1);
      expect(registerCommandSpy).toHaveBeenCalledWith("pii", expect.any(Object));
      expect(commands.has("pii")).toBe(true);
    });

    it("1.2 registers with expected description", () => {
      const { api, commands } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      const cmd = commands.get("pii");
      expect(cmd?.description).toBe("Manage PII redaction (status, toggle, rules, stats)");
    });

    it("1.3 registers getArgumentCompletions function", () => {
      const { api, commands } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      const cmd = commands.get("pii");
      expect(typeof cmd?.getArgumentCompletions).toBe("function");
    });

    it("1.4 registers handler function", () => {
      const { api, commands } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      const cmd = commands.get("pii");
      expect(typeof cmd?.handler).toBe("function");
    });

    it("1.5 does not register any unexpected command names", () => {
      const { api, commands } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(Array.from(commands.keys())).toEqual(["pii"]);
    });
  });

  // ==========================================================================
  // Suite 2: Subcommand Autocompletion
  // ==========================================================================
  describe("2. Subcommand Autocompletion", () => {
    it("2.1 returns all 6 subcommands for empty string prefix", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      const comps = getCompletions("pii", "");
      expect(comps).toHaveLength(6);
      expect(comps).toEqual([
        { value: "status", label: "status" },
        { value: "toggle", label: "toggle" },
        { value: "rules", label: "rules" },
        { value: "stats", label: "stats" },
        { value: "enable", label: "enable" },
        { value: "disable", label: "disable" },
      ]);
    });

    it("2.2 returns all 6 subcommands for whitespace-only prefix", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      const comps = getCompletions("pii", "   ");
      expect(comps).toHaveLength(6);
      expect(comps.map((c) => c.value)).toEqual(["status", "toggle", "rules", "stats", "enable", "disable"]);
    });

    it("2.3 completes prefix 'st' to status and stats", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      const comps = getCompletions("pii", "st");
      expect(comps).toEqual([
        { value: "status", label: "status" },
        { value: "stats", label: "stats" },
      ]);
    });

    it("2.4 completes prefix 't' and 'tog' to toggle", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(getCompletions("pii", "t")).toEqual([{ value: "toggle", label: "toggle" }]);
      expect(getCompletions("pii", "tog")).toEqual([{ value: "toggle", label: "toggle" }]);
    });

    it("2.5 completes prefix 'r' and 'rul' to rules", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(getCompletions("pii", "r")).toEqual([{ value: "rules", label: "rules" }]);
      expect(getCompletions("pii", "rul")).toEqual([{ value: "rules", label: "rules" }]);
    });

    it("2.6 completes prefix 'en' to enable", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(getCompletions("pii", "en")).toEqual([{ value: "enable", label: "enable" }]);
    });

    it("2.7 completes prefix 'di' to disable", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(getCompletions("pii", "di")).toEqual([{ value: "disable", label: "disable" }]);
    });

    it("2.8 handles uppercase prefixes case-insensitively", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(getCompletions("pii", "STATU")).toEqual([{ value: "status", label: "status" }]);
      expect(getCompletions("pii", "TOGGLE")).toEqual([{ value: "toggle", label: "toggle" }]);
      expect(getCompletions("pii", "EN")).toEqual([{ value: "enable", label: "enable" }]);
    });

    it("2.9 handles prefixes with leading and trailing whitespace", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(getCompletions("pii", "  dis  ")).toEqual([{ value: "disable", label: "disable" }]);
    });

    it("2.10 returns empty array for non-matching prefix", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      expect(getCompletions("pii", "xyz")).toEqual([]);
      expect(getCompletions("pii", "help")).toEqual([]);
      expect(getCompletions("pii", "123")).toEqual([]);
    });

    it("2.11 returns formatted objects with identical value and label", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);

      const comps = getCompletions("pii", "");
      for (const item of comps) {
        expect(item.value).toBe(item.label);
      }
    });
  });

  // ==========================================================================
  // Suite 3: Subcommand: status
  // ==========================================================================
  describe("3. Subcommand: status", () => {
    it("3.1 notifies with ACTIVE when redactor is enabled", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, isEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "status", ctx);

      expect(isEnabledSpy).toHaveBeenCalled();
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: ACTIVE"),
        "info"
      );
    });

    it("3.2 notifies with INACTIVE when redactor is disabled", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, isEnabledSpy } = createMockRedactorService({ enabled: false });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "status", ctx);

      expect(isEnabledSpy).toHaveBeenCalled();
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: INACTIVE"),
        "info"
      );
    });

    it("3.3 reports active rules count vs total rules count", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const customRules: PiiRule[] = [
        { id: "r1", name: "Rule 1", category: "email", enabled: true },
        { id: "r2", name: "Rule 2", category: "phone", enabled: true },
        { id: "r3", name: "Rule 3", category: "ip", enabled: true },
      ];
      const { redactor } = createMockRedactorService({ enabled: true, rules: customRules });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "status", ctx);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("Active rules: 3/3"),
        "info"
      );
    });

    it("3.4 accurately calculates active count when some rules are disabled", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const customRules: PiiRule[] = [
        { id: "r1", name: "Rule 1", category: "email", enabled: true },
        { id: "r2", name: "Rule 2", category: "phone", enabled: false },
        { id: "r3", name: "Rule 3", category: "ip", enabled: false },
        { id: "r4", name: "Rule 4", category: "api-key", enabled: true },
      ];
      const { redactor } = createMockRedactorService({ enabled: true, rules: customRules });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "status", ctx);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("Active rules: 2/4"),
        "info"
      );
    });

    it("3.5 handles empty rules list displaying 0/0", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true, rules: [] });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "status", ctx);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("Active rules: 0/0"),
        "info"
      );
    });

    it("3.6 does not change redactor enabled state or status bar", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "status", ctx);

      expect(setEnabledSpy).not.toHaveBeenCalled();
      expect(setStatusSpy).not.toHaveBeenCalled();
    });

    it("3.7 defaults to status when invoked with empty argument string", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "", ctx);

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: ACTIVE"),
        "info"
      );
    });

    it("3.8 defaults to status when invoked with whitespace-only string", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: false });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "   \t\n  ", ctx);

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: INACTIVE"),
        "info"
      );
    });

    it("3.9 processes uppercase STATUS argument correctly", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "STATUS", ctx);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: ACTIVE"),
        "info"
      );
    });

    it("3.10 processes argument with leading and trailing whitespace", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "   status   ", ctx);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: ACTIVE"),
        "info"
      );
    });
  });

  // ==========================================================================
  // Suite 4: Subcommand: enable
  // ==========================================================================
  describe("4. Subcommand: enable", () => {
    it("4.1 enables redactor by calling setEnabled(true)", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: false });
      const { ctx } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "enable", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(true);
    });

    it("4.2 updates status bar to 'PII: On'", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: false });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "enable", ctx);

      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");
    });

    it("4.3 notifies with 'PII redaction ENABLED' with info type", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: false });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "enable", ctx);

      expect(notifySpy).toHaveBeenCalledWith("PII redaction ENABLED", "info");
    });

    it("4.4 is idempotent when redactor is already enabled", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx, setStatusSpy, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "enable", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(true);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");
      expect(notifySpy).toHaveBeenCalledWith("PII redaction ENABLED", "info");
    });

    it("4.5 handles uppercase ENABLE argument", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: false });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "ENABLE", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(true);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");
    });

    it("4.6 handles arguments with trailing text (e.g. 'enable all')", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: false });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "enable all", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(true);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");
    });

    it("4.7 handles leading and trailing whitespace around enable", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: false });
      const { ctx } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "   enable   ", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(true);
    });
  });

  // ==========================================================================
  // Suite 5: Subcommand: disable
  // ==========================================================================
  describe("5. Subcommand: disable", () => {
    it("5.1 disables redactor by calling setEnabled(false)", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "disable", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
    });

    it("5.2 updates status bar to 'PII: Off'", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "disable", ctx);

      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");
    });

    it("5.3 notifies with 'PII redaction DISABLED' with info type", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "disable", ctx);

      expect(notifySpy).toHaveBeenCalledWith("PII redaction DISABLED", "info");
    });

    it("5.4 is idempotent when redactor is already disabled", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: false });
      const { ctx, setStatusSpy, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "disable", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");
      expect(notifySpy).toHaveBeenCalledWith("PII redaction DISABLED", "info");
    });

    it("5.5 handles uppercase DISABLE argument", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "DISABLE", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");
    });

    it("5.6 handles arguments with trailing text (e.g. 'disable temporarily')", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "disable temporarily", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
    });

    it("5.7 handles leading and trailing whitespace around disable", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "   disable   ", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
    });
  });

  // ==========================================================================
  // Suite 6: Subcommand: toggle
  // ==========================================================================
  describe("6. Subcommand: toggle", () => {
    it("6.1 toggles from enabled to disabled", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx, setStatusSpy, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "toggle", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");
      expect(notifySpy).toHaveBeenCalledWith("PII redaction is now DISABLED", "info");
    });

    it("6.2 toggles from disabled to enabled", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: false });
      const { ctx, setStatusSpy, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "toggle", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(true);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");
      expect(notifySpy).toHaveBeenCalledWith("PII redaction is now ENABLED", "info");
    });

    it("6.3 handles consecutive toggles flipping back and forth", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, statuses, notifications } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      // Turn 1: Enabled -> Disabled
      await executeCommand("pii", "toggle", ctx);
      expect(statuses.get("pii-redact")).toBe("PII: Off");
      expect(notifications[notifications.length - 1].message).toBe("PII redaction is now DISABLED");

      // Turn 2: Disabled -> Enabled
      await executeCommand("pii", "toggle", ctx);
      expect(statuses.get("pii-redact")).toBe("PII: On");
      expect(notifications[notifications.length - 1].message).toBe("PII redaction is now ENABLED");

      // Turn 3: Enabled -> Disabled
      await executeCommand("pii", "toggle", ctx);
      expect(statuses.get("pii-redact")).toBe("PII: Off");
      expect(notifications[notifications.length - 1].message).toBe("PII redaction is now DISABLED");
    });

    it("6.4 handles uppercase TOGGLE argument", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "TOGGLE", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: Off");
    });

    it("6.5 handles mixed-case ToGgLe argument", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: false });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "ToGgLe", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(true);
      expect(setStatusSpy).toHaveBeenCalledWith("pii-redact", "PII: On");
    });

    it("6.6 handles trailing arguments (e.g. 'toggle mode')", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "toggle mode", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
    });

    it("6.7 handles whitespace padded toggle argument", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "   toggle   ", ctx);

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
    });
  });

  // ==========================================================================
  // Suite 7: Subcommand: rules
  // ==========================================================================
  describe("7. Subcommand: rules", () => {
    it("7.1 formats each rule with bullet, name, id, and enabled status", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const customRules: PiiRule[] = [
        { id: "email", name: "Email Addresses", category: "email", enabled: true },
        { id: "api-key-generic", name: "API Keys", category: "api-key", enabled: false },
      ];
      const { redactor } = createMockRedactorService({ rules: customRules });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "rules", ctx);

      expect(notifySpy).toHaveBeenCalledTimes(1);
      const [msg, type] = notifySpy.mock.calls[0];
      expect(type).toBe("info");
      expect(msg).toContain("Active Redaction Rules:\n");
      expect(msg).toContain("• Email Addresses (email): enabled");
      expect(msg).toContain("• API Keys (api-key-generic): disabled");
    });

    it("7.2 formats all default rules properly", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "rules", ctx);

      const [msg] = notifySpy.mock.calls[0];
      expect(msg).toContain("Active Redaction Rules:\n");
      expect(msg).toContain("• Email Addresses (email): enabled");
      expect(msg).toContain("• Common API Keys & Tokens (api-key-generic): enabled");
      expect(msg).toContain("• IP Addresses (ip-address): enabled");
    });

    it("7.3 handles empty rules list displaying only header", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ rules: [] });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "rules", ctx);

      expect(notifySpy).toHaveBeenCalledWith("Active Redaction Rules:\n", "info");
    });

    it("7.4 does not alter redactor enabled state or status bar", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService();
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "rules", ctx);

      expect(setEnabledSpy).not.toHaveBeenCalled();
      expect(setStatusSpy).not.toHaveBeenCalled();
    });

    it("7.5 handles uppercase RULES argument", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "RULES", ctx);

      expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining("Active Redaction Rules:"), "info");
    });

    it("7.6 handles mixed-case RuLeS argument", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "RuLeS", ctx);

      expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining("Active Redaction Rules:"), "info");
    });

    it("7.7 handles trailing arguments (e.g. 'rules list')", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "rules list", ctx);

      expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining("Active Redaction Rules:"), "info");
    });

    it("7.8 handles whitespace padded rules argument", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "   rules   ", ctx);

      expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining("Active Redaction Rules:"), "info");
    });
  });

  // ==========================================================================
  // Suite 8: Invalid Subcommands & Fallback Behavior
  // ==========================================================================
  describe("8. Invalid Subcommands & Fallback Behavior", () => {
    it("8.1 falls through to status notification when unrecognized subcommand is passed", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "unrecognized_command_xyz", ctx);

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: ACTIVE"),
        "info"
      );
    });

    it("8.2 does not alter redactor state when invalid subcommand is executed", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor, setEnabledSpy } = createMockRedactorService({ enabled: true });
      const { ctx } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "foobar", ctx);

      expect(setEnabledSpy).not.toHaveBeenCalled();
    });

    it("8.3 does not alter status bar when invalid subcommand is executed", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, setStatusSpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "unknown", ctx);

      expect(setStatusSpy).not.toHaveBeenCalled();
    });

    it("8.4 handles command with special symbols and dashes (e.g. '--help', '-v')", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: true });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "--help", ctx);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: ACTIVE"),
        "info"
      );
    });

    it("8.5 handles numeric and malformed subcommand tokens gracefully", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService({ enabled: false });
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "12345 !@#$", ctx);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringContaining("PII Redactor status: INACTIVE"),
        "info"
      );
    });
  });

  // ==========================================================================
  // Suite 9: Integration with Real RedactorService
  // ==========================================================================
  describe("9. Integration with Real RedactorService", () => {
    it("9.1 integrates status command with real RedactorService", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const redactor = new RedactorService();
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      await executeCommand("pii", "status", ctx);

      expect(notifySpy).toHaveBeenCalledTimes(1);
      const [msg, type] = notifySpy.mock.calls[0];
      expect(type).toBe("info");
      expect(msg).toContain("PII Redactor status: ACTIVE");
      expect(msg).toMatch(/Active rules: \d+\/\d+/);
    });

    it("9.2 enables and disables live RedactorService via slash commands", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const redactor = new RedactorService();
      const { ctx, statuses, notifications } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      // Disable
      await executeCommand("pii", "disable", ctx);
      expect(redactor.isEnabled()).toBe(false);
      expect(statuses.get("pii-redact")).toBe("PII: Off");
      expect(notifications[notifications.length - 1].message).toBe("PII redaction DISABLED");

      // Enable
      await executeCommand("pii", "enable", ctx);
      expect(redactor.isEnabled()).toBe(true);
      expect(statuses.get("pii-redact")).toBe("PII: On");
      expect(notifications[notifications.length - 1].message).toBe("PII redaction ENABLED");
    });

    it("9.3 toggles live RedactorService repeatedly", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const redactor = new RedactorService();
      const { ctx, statuses } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      expect(redactor.isEnabled()).toBe(true);

      await executeCommand("pii", "toggle", ctx);
      expect(redactor.isEnabled()).toBe(false);
      expect(statuses.get("pii-redact")).toBe("PII: Off");

      await executeCommand("pii", "toggle", ctx);
      expect(redactor.isEnabled()).toBe(true);
      expect(statuses.get("pii-redact")).toBe("PII: On");
    });

    it("9.4 reflects rule toggling dynamically in status and rules command", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const redactor = new RedactorService();
      const { ctx, notifySpy } = createMockCommandContext();
      registerPiiCommands(api, redactor);

      const initialTotal = redactor.getRules().length;
      const initialActive = redactor.getRules().filter((r) => r.enabled).length;

      // Disable email rule directly on redactor
      redactor.toggleRule("email", false);

      // Run status
      await executeCommand("pii", "status", ctx);
      const statusMsg = notifySpy.mock.calls[0][0];
      expect(statusMsg).toContain(`Active rules: ${initialActive - 1}/${initialTotal}`);

      // Run rules
      await executeCommand("pii", "rules", ctx);
      const rulesMsg = notifySpy.mock.calls[1][0];
      expect(rulesMsg).toContain("• Email Addresses (email): disabled");
      expect(rulesMsg).toContain("• Common API Keys & Tokens (api-key-generic): enabled");
    });
  });

  describe("/pii stats", () => {
    it("offers 'stats' completion", () => {
      const { api, getCompletions } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);
      expect(getCompletions("pii", "st").map((c) => c.value)).toContain("stats");
    });

    it("notifies plain text outside the TUI (RPC custom() is a no-op) and never leaks originals or tokens", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const fx = createMockRedactorService();
      const token = fx.vault.tokenFor("GIVEN_NAME", "Alice");
      registerPiiCommands(api, fx.redactor);
      const { ctx, customSpy, notifications } = createMockCommandContext({ withCustom: true });
      (ctx as any).mode = "rpc";
      await executeCommand("pii", "stats", ctx);
      expect(customSpy).not.toHaveBeenCalled();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toContain("PII redaction usage");
      expect(notifications[0].message).toContain("given name");
      expect(notifications[0].message).not.toContain("Alice");
      expect(notifications[0].message).not.toContain(token);
    });

    it("opens an overlay via ui.custom when a UI is available", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);
      const { ctx, customSpy, notifications } = createMockCommandContext({ withCustom: true });
      await executeCommand("pii", "stats", ctx);
      expect(customSpy).toHaveBeenCalledTimes(1);
      expect((customSpy.mock.calls[0] as any[])[1]).toEqual({ overlay: true });
      expect(notifications).toHaveLength(0);
    });

    it("renders the overlay as a box whose rows all have the same width", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const { redactor } = createMockRedactorService();
      registerPiiCommands(api, redactor);
      const { ctx, customSpy } = createMockCommandContext({ withCustom: true });
      await executeCommand("pii", "stats", ctx);
      const factory = (customSpy.mock.calls[0] as any[])[0];
      const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
      const done = vi.fn();
      const component = factory({}, theme, {}, done);

      for (const width of [120, 40]) {
        const lines: string[] = component.render(width);
        expect(lines[0].startsWith("╭")).toBe(true);
        expect(lines[lines.length - 1].startsWith("╰")).toBe(true);
        const widths = new Set(lines.map((l) => visibleWidth(l)));
        expect(widths.size).toBe(1);
        expect([...widths][0]).toBeLessThanOrEqual(width);
      }

      component.handleInput("q");
      expect(done).toHaveBeenCalled();
    });

    it("fits a populated board into a short terminal and scrolls, keeping borders and hint", async () => {
      const { api, executeCommand } = createMockExtensionAPI();
      const fx = createMockRedactorService();
      for (const [label, value] of [["EMAIL", "a@x.io"], ["PHONE", "555"], ["CITY", "Rome"], ["SURNAME", "Doe"], ["IP", "1.2.3.4"]]) {
        fx.vault.tokenFor(label, value);
      }
      registerPiiCommands(api, fx.redactor);
      const { ctx, customSpy } = createMockCommandContext({ withCustom: true });
      await executeCommand("pii", "stats", ctx);
      const factory = (customSpy.mock.calls[0] as any[])[0];
      const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
      const tui = { terminal: { rows: 24 }, requestRender: vi.fn() };
      const component = factory(tui, theme, {}, vi.fn());

      const first: string[] = component.render(80);
      expect(first.length).toBeLessThanOrEqual(24);
      expect(first[first.length - 1].startsWith("╰")).toBe(true);
      expect(first[first.length - 2]).toContain("↑↓ scroll · Esc to close");
      expect(first.join("\n")).not.toContain("Run counters reset");

      for (let i = 0; i < 40; i++) component.handleInput("\x1b[B");
      const last: string[] = component.render(80);
      expect(last.length).toBe(first.length);
      expect(last.join("\n")).toContain("Run counters reset");
      expect(tui.requestRender).toHaveBeenCalled();
    });
  });
});
