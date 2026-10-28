import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerHooks } from "./hooks/index.js";
import { registerPiiCommands } from "./commands/pii.js";
import { RedactorService } from "./services/redactor.js";

export default function (pi: ExtensionAPI) {
  const redactor = new RedactorService();

  registerHooks(pi, redactor);
  registerPiiCommands(pi, redactor);
}
