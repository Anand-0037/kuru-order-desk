import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  hash,
  integer,
  record,
  safeMs,
  type PreparedIntent,
} from "./domain.ts";
import { digest, verifyIntent } from "./planner.ts";
import type { OrderStatus } from "./evidence.ts";

export interface Operation {
  phase: "not-started" | "started" | "broadcast" | "unknown";
  atMs?: number;
  hash?: string;
  error?: string;
}
export interface CancelPreview {
  digest: string;
  orderId: string;
  slot: number;
  quantity: string;
  expiresAtMs: number;
  clientOrderId: `0x${string}`;
}
export interface IntentRecord {
  version: 1;
  intent: PreparedIntent;
  submission: Operation;
  cancellation: Operation;
  status?: OrderStatus;
  cancelPreview?: CancelPreview;
}
function operation(value: unknown): void {
  const v = record(value);
  if (
    !["not-started", "started", "broadcast", "unknown"].includes(
      v.phase as string,
    )
  )
    throw new Error("Invalid operation phase");
  if (v.phase !== "not-started") safeMs(v.atMs);
  if (v.phase === "broadcast") hash(v.hash);
  if (v.hash !== undefined) hash(v.hash);
  if (
    v.error !== undefined &&
    (typeof v.error !== "string" || v.error.length > 1000)
  )
    throw new Error("Invalid operation error");
}
export function validateRecord(value: unknown): IntentRecord {
  const v = record(value);
  if (v.version !== 1 || !verifyIntent(v.intent))
    throw new Error("Invalid persisted intent");
  operation(v.submission);
  operation(v.cancellation);
  const i = v.intent;
  if (v.cancelPreview !== undefined) {
    const p = record(v.cancelPreview);
    if (typeof p.digest !== "string" || !/^[a-f0-9]{64}$/.test(p.digest))
      throw new Error("Invalid cancellation digest");
    hash(p.clientOrderId);
    const order = integer(p.orderId, "cancel orderId", (1n << 64n) - 1n),
      quantity = integer(p.quantity, "cancel quantity", (1n << 96n) - 1n);
    if (
      !order ||
      !quantity ||
      quantity > BigInt(i.quantity) ||
      typeof p.slot !== "number" ||
      !Number.isInteger(p.slot) ||
      p.slot < 0 ||
      p.slot >= 62
    )
      throw new Error("Invalid cancellation preview identity");
    const expiresAtMs = safeMs(p.expiresAtMs);
    const expected = digest({
      intentDigest: i.digest,
      orderId: p.orderId,
      slot: p.slot,
      quantity: p.quantity,
      expiresAtMs,
    });
    if (p.digest !== expected || p.clientOrderId !== `0x${expected}`)
      throw new Error("Invalid cancellation preview digest binding");
  }
  if (
    record(v.cancellation).phase !== "not-started" &&
    v.cancelPreview === undefined
  )
    throw new Error("Invalid cancellation barrier without reviewed preview");
  return v as unknown as IntentRecord;
}
export class IntentStore {
  readonly directory: string;
  private locked = false;
  constructor(directory: string) {
    this.directory = resolve(directory);
  }
  private path(id: string): string {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid intent id");
    return join(this.directory, `${id}.json`);
  }
  private async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("State directory must be a real private directory");
    if (process.platform === "win32")
      throw new Error(
        "State directory ACL privacy cannot be verified on Windows; use Linux or WSL",
      );
    if ((info.mode & 0o077) !== 0)
      throw new Error(
        "State directory must not be accessible by group or others",
      );
  }
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.init();
    const path = join(this.directory, ".lock");
    let lock;
    try {
      lock = await open(path, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error(
          "State directory is locked. Do not retry writes or delete the lock until its process is verified stopped.",
        );
      throw error;
    }
    const token = randomUUID();
    try {
      await lock.writeFile(
        JSON.stringify({
          pid: process.pid,
          token,
          createdAt: new Date().toISOString(),
        }),
      );
      await lock.sync();
      this.locked = true;
      return await fn();
    } finally {
      this.locked = false;
      await lock.close();
      await unlink(path);
    }
  }
  private requireLock(): void {
    if (!this.locked) throw new Error("State mutation requires lock");
  }
  async create(intent: PreparedIntent): Promise<void> {
    this.requireLock();
    if (!verifyIntent(intent)) throw new Error("Invalid intent");
    const value: IntentRecord = {
      version: 1,
      intent,
      submission: { phase: "not-started" },
      cancellation: { phase: "not-started" },
    };
    const f = await open(this.path(intent.id), "wx", 0o600);
    try {
      await f.writeFile(JSON.stringify(value, null, 2));
      await f.sync();
    } finally {
      await f.close();
    }
    await this.syncDirectory();
  }
  async read(id: string): Promise<IntentRecord> {
    const path = this.path(id),
      f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await f.stat();
      if (!stat.isFile() || stat.size > 2_000_000)
        throw new Error("Invalid state file");
      const value = validateRecord(JSON.parse(await f.readFile("utf8")));
      if (value.intent.id !== id)
        throw new Error("Invalid intent filename binding");
      return value;
    } finally {
      await f.close();
    }
  }
  async list(): Promise<IntentRecord[]> {
    await this.init();
    const files = (await readdir(this.directory)).filter((x) =>
      /^[a-f0-9]{64}\.json$/.test(x),
    );
    return Promise.all(files.map((x) => this.read(x.slice(0, -5))));
  }
  async save(value: IntentRecord): Promise<void> {
    this.requireLock();
    validateRecord(value);
    const old = await this.read(value.intent.id);
    for (const key of ["submission", "cancellation"] as const) {
      const before = old[key].phase,
        after = value[key].phase;
      if (before !== "not-started" && after === "not-started")
        throw new Error("Cannot clear a submission barrier");
      if (
        before === "broadcast" &&
        (after !== "broadcast" || old[key].hash !== value[key].hash)
      )
        throw new Error("Cannot change a broadcast transaction identity");
    }
    const path = this.path(value.intent.id),
      temp = `${path}.${randomUUID()}.tmp`,
      f = await open(temp, "wx", 0o600);
    try {
      await f.writeFile(JSON.stringify(value, null, 2));
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(temp, path);
    await this.syncDirectory();
  }
  private async syncDirectory(): Promise<void> {
    const f = await open(this.directory, "r");
    try {
      await f.sync();
    } finally {
      await f.close();
    }
  }
}
