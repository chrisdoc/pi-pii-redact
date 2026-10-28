# Test Infrastructure & Methodology: `pi-pii-redact` E2E Test Suite

## 1. Overview & Architectural Principles

The `pi-pii-redact` end-to-end (E2E) test suite provides comprehensive, opaque-box verification of sensitive data detection, redaction, extension hooks, configuration, and slash commands. Derived directly from user requirements in `ORIGINAL_REQUEST.md` and the architecture in `PROJECT.md`, tests evaluate the extension from the outside via public entry points and extension contracts.

### Core Testing Principles
1. **Opaque-Box & Requirement-Driven**: Tests interact with the extension via public entry points (`src/index.ts`, `registerHooks`, `registerPiiCommands`, `RedactorService`) and simulate the Pi coding agent runtime environment without peering into internal private variables.
2. **Confidentiality-First Assertion Model**: In every redaction scenario, the authoritative expected outcome requires that the sensitive original text (email, secret API key, IP address, phone number, credit card) is **strictly purged** from transformed outputs, and replaced with an appropriate placeholder token.
3. **Dual Placeholder Compatibility**: Supports both existing redaction tokens (e.g. `[REDACTED:EMAIL]`, `[REDACTED:API_KEY]`) and `@desert-ant-labs/redact` tokens (e.g. `[EMAIL_1]`, `[IP_ADDRESS_1]`), ensuring forward-compatibility as native engine milestones land.
4. **Isolated & Self-Contained Execution**: Every test instantiates a fresh `PiTestHarness` with isolated state, independent mock contexts, and clean UI notification histories.
5. **Progressive Testability**: All tests execute against the public extension contracts and hooks, verifying baseline behavior immediately while remaining robust to underlying engine migration.

---

## 2. Test Harness Architecture (`tests/e2e/harness.ts`)

The test harness replicates the runtime contracts defined by `@earendil-works/pi-coding-agent`:

```
┌─────────────────────────────────────────────────────────────────┐
│                        PiTestHarness                            │
│                                                                 │
│  ┌─────────────────────────┐      ┌──────────────────────────┐  │
│  │    MockExtensionAPI     │      │   MockExtensionContext   │  │
│  │ ─────────────────────── │      │ ──────────────────────── │  │
│  │ • on(event, handler)    │      │ • cwd, mode, hasUI       │  │
│  │ • registerCommand()     │      │ • ui: MockUIContext      │  │
│  │ • hookHandlers map      │      │   - statuses (Map)       │  │
│  │ • commands map          │      │   - notifications (list) │  │
│  └─────────────────────────┘      └──────────────────────────┘  │
│                                                                 │
│  Public Simulation Triggers:                                    │
│  • initExtension() / initCustomExtension()                      │
│  • triggerSessionStart()                                        │
│  • triggerInput(text)                                           │
│  • triggerToolResult(toolName, content)                         │
│  • triggerContext(messages)                                     │
│  • executeCommand(args)                                         │
│  • getCommandCompletions(prefix)                                │
└─────────────────────────────────────────────────────────────────┘
```

### Components:
- **`MockExtensionAPI`**: Implements `on(event, handler)` and `registerCommand(name, options)`, storing handlers for runtime simulation.
- **`MockExtensionUIContext`**: Captures status line modifications (`setStatus(key, text)`) and notifications (`notify(message, type)`).
- **`MockExtensionContext`**: Provides the context object passed to all hooks and commands.
- **`PiTestHarness`**: Orchestrates extension initialization and exposes typed invocation methods for all 4 hooks (`session_start`, `input`, `tool_result`, `context`) and `/pii` commands.
- **Verification Matchers**:
  - `assertRedactedEmail(text, original)`
  - `assertRedactedApiKey(text, original)`
  - `assertRedactedIp(text, original)`
  - `assertRedactedPhone(text, original)`
  - `assertRedactedCreditCard(text, original)`

---

## 3. 4-Tier Test Suite Structure

The test suite is structured across 4 distinct tiers under `tests/e2e/`:

```
tests/e2e/
├── harness.ts                  # Test harness and simulation framework
├── tier1-features.test.ts      # Tier 1: Core Feature Coverage (>=5 tests per feature)
├── tier2-boundaries.test.ts    # Tier 2: Boundary & Corner Cases (>=5 tests per feature)
├── tier3-combinations.test.ts  # Tier 3: Cross-Feature Combinations & State Shifts
└── tier4-workflows.test.ts     # Tier 4: Real-World Developer Workflows & Scenarios
```

### Tier Breakdown

| Tier | File | Scope | Coverage Objective | Minimum Tests |
|---|---|---|---|---|
| **Tier 1: Feature Coverage** | `tier1-features.test.ts` | Isolated verification of each individual feature and hook in isolation | Features 1–12 from `PROJECT.md`: Email, API Keys, IPv4, Phone, Credit Card, `session_start`, `input`, `tool_result`, `context`, `/pii` slash commands, configuration flags, entry point wiring. | >= 5 per feature group (>= 60 tests) |
| **Tier 2: Boundaries & Corners** | `tier2-boundaries.test.ts` | Edge cases, boundary inputs, malformed structures, Unicode, extreme lengths | Empty strings, whitespace, null/undefined properties, multi-match repetition, adjacent entities, multilingual & Unicode text, malformed candidates, non-text content items, non-array inputs, case variations. | >= 5 per boundary group (>= 50 tests) |
| **Tier 3: Combinations** | `tier3-combinations.test.ts` | Cross-feature interactions and state transitions | Multi-PII user inputs, multi-block tool results with mixed sensitive & clean items, multi-turn conversation context history, slash command toggle (`/pii toggle`, `/pii enable`, `/pii disable`) affecting live hooks in an active session, notification suppression with active masking. | Multiple end-to-end integration flows (>= 12 tests) |
| **Tier 4: Workflows** | `tier4-workflows.test.ts` | Realistic end-to-end developer workflows | 1. Git diff with committed API keys & tokens.<br>2. Production server logs with IPs and user emails.<br>3. Crash stack trace with database credentials, connection strings, host IPs, and support phone.<br>4. CI/CD build logs with auth tokens & webhook URLs.<br>5. REST API JSON customer profiles with mixed PII.<br>6. Full turn lifecycle: input -> tool execution -> context history. | 6 comprehensive real-world scenarios |

---

## 4. Authoritative Expected Output Derivation

For every test case, the expected output is derived from authoritative requirements:

1. **User Request (`ORIGINAL_REQUEST.md`)**:
   - `R1`: Package dependency `@desert-ant-labs/redact@4.2.1`.
   - `R2`: Redaction engine detects and redacts sensitive data and PII across the extension.
   - `R3`: Preserve existing extension hooks (masking user inputs, tool results, context messages), commands, and configuration behavior.
2. **Interface Contracts (`PROJECT.md § Interface Contracts`)**:
   - `input` hook: returns `{ action: "transform", text: string }` if modified; returns `undefined` if unmodified or disabled.
   - `tool_result` hook: returns `{ content: Array<{ type: "text", text: string, ... }> }` if modified; returns `undefined` if unmodified or disabled.
   - `context` hook: returns `{ messages: Array<{ role: string, content: ... }> }` if modified; returns `undefined` if unmodified or disabled.
   - `session_start` hook: calls `ctx.ui.setStatus("pii-redact", "PII: On" | "PII: Off")`.
   - `/pii` command: supports `status`, `toggle`, `enable`, `disable`, `rules`, updating UI status and notifications.
3. **Data Protection Invariant**:
   - For any string $S$ containing secret $K$, transformed output $S'$ must satisfy: $K \notin S'$ and $\text{Placeholder} \in S'$.

---

## 5. Execution & Verification

### Running the E2E Test Suite
```bash
# Run only E2E tests
npx vitest run tests/e2e

# Run all tests (unit + E2E)
npm test

# Verify type safety across project
npm run typecheck
```
