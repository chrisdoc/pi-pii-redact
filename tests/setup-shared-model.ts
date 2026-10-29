import { vi } from "vitest";
import { MaskerMini } from "../src/services/masker-mini/index.js";

// Loading the on-device model dominates per-test cost, and most tests create a fresh
// RedactorService. Load once per worker and hand the same instance to every service;
// dispose() is a no-op so one test cannot tear the model down for the next.
export const realLoad = MaskerMini.load.bind(MaskerMini);
const loaded = new Map<string, Promise<MaskerMini>>();

vi.spyOn(MaskerMini, "load").mockImplementation((options?: Parameters<typeof MaskerMini.load>[0]) => {
  const key = JSON.stringify(options ?? {});
  let p = loaded.get(key);
  if (!p) {
    p = realLoad(options).then((inst) => {
      inst.dispose = () => {};
      return inst;
    });
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
});
