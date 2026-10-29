import fs from "node:fs";
import type { NerEngine, NerItem } from "../ner-engine.js";
import { chunkWindows } from "./chunk.js";
import { buildLabelTable, decodeBioes, type DecodedLabel, type Prediction, type Span } from "./decode.js";
import { dedupeSpans, filterSpans } from "./merge.js";
import { resolveMaskerFiles } from "./model-files.js";
import { refineSpans } from "./postprocess.js";
import { tokenizeWithOffsets, type ContentToken, type TokenizerLike } from "./tokenize.js";

const CLS_ID = 1;
const SEP_ID = 2;

export interface MaskerLoadOptions {
  /** Use model files from this directory (never downloads). Defaults to $PI_PII_REDACT_MODEL_DIR. */
  directory?: string;
  /** Override the download cache root (default: $XDG_CACHE_HOME or ~/.cache). */
  cacheRoot?: string;
}

/** Minimal views of the onnxruntime-node API we use. */
interface OrtTensorLike {
  dims: readonly number[];
  data: ArrayLike<number | bigint>;
}
interface OrtSessionLike {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorLike>>;
  release(): Promise<void>;
}
interface OrtLike {
  Tensor: new (type: "int64", data: BigInt64Array, dims: number[]) => unknown;
  InferenceSession: {
    create(path: string, options?: Record<string, unknown>): Promise<OrtSessionLike>;
  };
}

async function importRuntime<T>(name: string): Promise<T> {
  try {
    const mod = (await import(name)) as { default?: unknown };
    return ((mod as Record<string, unknown>).InferenceSession || !mod.default ? mod : mod.default) as T;
  } catch (error) {
    throw new Error(
      `Could not load the "${name}" package that runs the on-device redaction model ` +
        `(try reinstalling dependencies: npm install): ${(error as Error).message}`
    );
  }
}

/** Softmax over one row of logits; returns [argmax, probability of argmax]. */
export function argmaxSoftmax(logits: ArrayLike<number | bigint>, offset: number, width: number): [number, number] {
  let max = -Infinity;
  let arg = 0;
  for (let i = 0; i < width; i++) {
    const v = Number(logits[offset + i]);
    if (v > max) {
      max = v;
      arg = i;
    }
  }
  let sum = 0;
  for (let i = 0; i < width; i++) sum += Math.exp(Number(logits[offset + i]) - max);
  return [arg, 1 / sum];
}

export class MaskerMini implements NerEngine {
  private session: OrtSessionLike | null;
  private readonly ort: OrtLike;
  private readonly tokenizer: TokenizerLike;
  private readonly labels: Array<DecodedLabel | null>;

  // No parameter properties: the package ships .ts source, which must stay strip-only compatible.
  private constructor(
    session: OrtSessionLike,
    ort: OrtLike,
    tokenizer: TokenizerLike,
    labels: Array<DecodedLabel | null>
  ) {
    this.session = session;
    this.ort = ort;
    this.tokenizer = tokenizer;
    this.labels = labels;
  }

  static async load(opts: MaskerLoadOptions = {}): Promise<MaskerMini> {
    const files = await resolveMaskerFiles({
      directory: opts.directory || process.env.PI_PII_REDACT_MODEL_DIR || undefined,
      cacheRoot: opts.cacheRoot,
    });
    // onnxruntime-node ships Microsoft 1DS telemetry on Linux: it writes a device id and a
    // database under ~/.cache/Microsoft and can upload over HTTPS. The flag is read when the
    // native binding is first imported, so force it off right before that import.
    process.env.ORT_DISABLE_TELEMETRY = "1";
    const ort = await importRuntime<OrtLike>("onnxruntime-node");
    const { Tokenizer } = await importRuntime<{
      Tokenizer: new (json: unknown, config: unknown) => TokenizerLike;
    }>("@huggingface/tokenizers");
    const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
    const tokenizer = new Tokenizer(readJson(files.tokenizerPath), readJson(files.tokenizerConfigPath));
    const labels = buildLabelTable(readJson(files.configPath).id2label);
    // logSeverityLevel 3 = errors only, so ORT warnings do not land in Pi's TUI.
    const session = await ort.InferenceSession.create(files.modelPath, { logSeverityLevel: 3 });
    return new MaskerMini(session, ort, tokenizer, labels);
  }

  async redaction(
    text: string,
    options: { labels?: Iterable<string>; minimumConfidence?: number } = {}
  ): Promise<{ items: NerItem[] }> {
    const session = this.session;
    if (!session) throw new Error("masker-mini: model has been disposed");
    if (!options.labels || !text.trim()) return { items: [] };

    const tokens = tokenizeWithOffsets(this.tokenizer, text);
    const spans: Span[] = [];
    for (const window of chunkWindows(tokens)) {
      spans.push(...(await this.runWindow(session, window, text)));
    }
    const kept = dedupeSpans(filterSpans(refineSpans(spans, text), options.labels, options.minimumConfidence ?? 0));
    return {
      items: kept.map((s) => ({
        label: s.label,
        original: text.slice(s.start, s.end),
        start: s.start,
        end: s.end,
        confidence: s.confidence,
      })),
    };
  }

  private async runWindow(session: OrtSessionLike, window: ContentToken[], text: string): Promise<Span[]> {
    const ids = [CLS_ID, ...window.map((t) => t.id), SEP_ID];
    const n = ids.length;
    const tensor = (values: number[]) => new this.ort.Tensor("int64", BigInt64Array.from(values, BigInt), [1, n]);
    const feeds: Record<string, unknown> = {
      input_ids: tensor(ids),
      attention_mask: tensor(ids.map(() => 1)),
    };
    if (session.inputNames.includes("token_type_ids")) feeds.token_type_ids = tensor(ids.map(() => 0));
    const out = (await session.run(feeds))[session.outputNames[0]];
    const width = out.dims[out.dims.length - 1];
    const predictions: Prediction[] = window.map((t, i) => {
      const [classIndex, confidence] = argmaxSoftmax(out.data, (i + 1) * width, width);
      return { range: t.range, classIndex, confidence };
    });
    return decodeBioes(predictions, this.labels, text);
  }

  dispose(): void {
    const session = this.session;
    this.session = null;
    if (session) void session.release().catch(() => {});
  }
}
