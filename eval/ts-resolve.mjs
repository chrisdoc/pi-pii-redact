// Resolve hook: the repo's TypeScript sources import "./x.js" for files that are "x.ts".
// When a relative .js specifier fails to resolve, retry it as .ts.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && specifier.endsWith(".js")) {
        return nextResolve(specifier.slice(0, -3) + ".ts", context);
      }
      throw err;
    }
  },
});
