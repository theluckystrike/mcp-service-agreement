import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Agreement } from "./agreement.js";

/**
 * Agreements live in this server's OWN data directory,
 * `${XDG_DATA_HOME:-~/.local/share}/mcp-servers/service-agreement/`, in
 * `agreements.json` and `counter.json`. Nothing else is written anywhere.
 *
 * A read or parse failure must never be reported as "no agreements": the next mutation
 * would then overwrite a history that is still on disk. Only ENOENT means empty. A
 * parse failure quarantines the file byte-for-byte as `<file>.corrupt-<timestamp>`,
 * writes a `.corrupt` marker beside it, and every later call fails loudly until a
 * human resolves it.
 */

export class CorruptDataError extends Error {}

function stamp(): string { return new Date().toISOString().replace(/[:.]/g, "-"); }

function markerPath(file: string): string { return `${file}.corrupt`; }

function blocked(file: string, moved: string): CorruptDataError {
  return new CorruptDataError(
    `data file is corrupt; moved to ${moved}; nothing was written. ` +
    `Restore a good copy to ${file}, then delete ${markerPath(file)} to continue.`,
  );
}

/**
 * Create a directory and any missing ancestors, without mkdirSync's recursive mode.
 * mkdirSync(recursive) never returns on a pseudo-filesystem: a caller-supplied base
 * under /proc, /sys or /dev reads ENOENT at every level and Node retries forever. The
 * ancestors are walked under a hard bound and each level is created non-recursively, so
 * a repeated ENOENT terminates on the first one.
 */
function ensureDirBounded(dir: string): void {
  if (existsSync(dir)) return;
  const missing: string[] = [];
  let cur = dir;
  for (let i = 0; i < 64 && !existsSync(cur); i++) {
    missing.push(cur);
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  if (!existsSync(cur)) throw new Error(`cannot create ${dir}: no existing ancestor directory`);
  for (const d of missing.reverse()) mkdirSync(d);
}

export function dataDir(): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  const dir = join(base, "mcp-servers", "service-agreement");
  ensureDirBounded(dir);
  return dir;
}

export function lockPath(): string { return join(dataDir(), ".lock"); }

function read<T>(file: string, empty: T): T {
  const p = join(dataDir(), file);
  if (existsSync(markerPath(p))) throw blocked(p, `${p}.corrupt-*`);
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty;
    throw new CorruptDataError(`cannot read the data file ${p}: ${(e as Error).message}; nothing was written.`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    const moved = `${p}.corrupt-${stamp()}`;
    try {
      renameSync(p, moved);
      writeFileSync(markerPath(p), JSON.stringify({ quarantined: moved, at: new Date().toISOString() }) + "\n");
    } catch { /* keep the parse error */ }
    process.stderr.write(`mcp-service-agreement: ${p} is not valid JSON (${(e as Error).message}); moved to ${moved}\n`);
    throw blocked(p, moved);
  }
}

/** Atomic: per-process temp name, then rename over the target. */
function write(file: string, value: unknown): void {
  const p = join(dataDir(), file);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, p);
}

export function getAgreements(): Agreement[] { return read<Agreement[]>("agreements.json", []); }
export function setAgreements(v: Agreement[]): void { write("agreements.json", v); }

/**
 * Allocate the next id in the series: `SA-<YYYY>-<NNNN>`.
 *
 * The counter is written BEFORE the agreement is stored, so a crash burns a number
 * rather than reusing one. Ids already in the store are also scanned, so a restored or
 * hand-edited store cannot reissue a number that is already on a signed document.
 */
export function nextId(year: string, existing: string[]): string {
  const counters = read<Record<string, number>>("counter.json", {});
  const key = `SA-${year}`;
  let n = counters[key] ?? 0;
  const used = new Set(existing);
  do { n += 1; } while (used.has(`${key}-${String(n).padStart(4, "0")}`));
  counters[key] = n;
  write("counter.json", counters);
  return `${key}-${String(n).padStart(4, "0")}`;
}

/**
 * Resolve an agreement by exact id (case-insensitive), then by exact client name, then
 * -- only if nothing exact matched -- by partial client name. More than one partial
 * candidate is refused with the list rather than silently picking the first.
 */
export function findAgreement(list: Agreement[], ref: string): Agreement | undefined {
  const needle = String(ref).trim().toLowerCase();
  const byId = list.find((a) => a.id.toLowerCase() === needle);
  if (byId) return byId;
  const exact = list.filter((a) => a.client.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  const pool = exact.length ? exact : list.filter((a) => a.client.toLowerCase().includes(needle));
  if (pool.length > 1) {
    throw new Error(`"${ref}" matches more than one agreement: ${pool.map((a) => `${a.id} (${a.client})`).join(", ")}. Pass the exact id.`);
  }
  return pool[0];
}

export function resolveAgreement(list: Agreement[], ref: string): Agreement {
  const a = findAgreement(list, ref);
  if (!a) throw new Error(`no agreement matches "${ref}". Known: ${list.map((x) => `${x.id} (${x.client})`).join(", ") || "none"}. Nothing was written.`);
  return a;
}
