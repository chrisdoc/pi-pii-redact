import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerHooks } from "./hooks/index.js";
import { registerPiiCommands } from "./commands/pii.js";
import { RedactorService } from "./services/redactor.js";
import { PiiStats } from "./services/stats.js";

export default function (pi: ExtensionAPI) {
  const redactor = new RedactorService();
  const stats = new PiiStats();

  registerHooks(pi, redactor, stats);
  registerPiiCommands(pi, redactor, stats);
}
