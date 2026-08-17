import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { DocId, ProjectMeta } from "./types";

const META_FILE = ".meta.json";
const SCHEMA_VERSION = 1;

export function projectsRoot(): string {
  const fromEnv = process.env.PI_PROJECTS_ROOT;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return path.join(os.homedir(), ".pi-projects");
}

export function validateProjectName(name: string): void {
  if (typeof name !== "string") {
    throw new Error("Invalid project name: must be a string");
  }
  if (name === "." || name === "..") {
    throw new Error(`Invalid project name: "${name}" is not allowed`);
  }
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(name)) {
    throw new Error(
      `Invalid project name: "${name}" must match /^[a-zA-Z0-9._-]{1,64}$/`,
    );
  }
}

export function projectDir(name: string): string {
  validateProjectName(name);
  const root = projectsRoot();
  const joined = path.join(root, name);
  const resolved = path.resolve(joined);
  const resolvedRoot = path.resolve(root);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(
      `Invalid project name: "${name}" escapes projects root`,
    );
  }
  if (resolved === resolvedRoot) {
    throw new Error(
      `Invalid project name: "${name}" resolves to projects root`,
    );
  }
  return resolved;
}

export async function projectExists(name: string): Promise<boolean> {
  try {
    const dir = projectDir(name);
    const st = await fsp.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}

export async function listProjects(): Promise<
  { name: string; updatedAt: number }[]
> {
  const root = projectsRoot();
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (err: any) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
  const out: { name: string; updatedAt: number }[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(name)) continue;
    if (name === "." || name === "..") continue;
    let updatedAt = 0;
    try {
      const metaPath = path.join(root, name, META_FILE);
      const raw = await fsp.readFile(metaPath, "utf8");
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.updatedAt === "number" &&
        Number.isFinite(parsed.updatedAt)
      ) {
        updatedAt = parsed.updatedAt;
      }
    } catch {
      updatedAt = 0;
    }
    out.push({ name, updatedAt });
  }
  return out;
}

function docPath(name: string, doc: DocId): string {
  return path.join(projectDir(name), `${doc}.md`);
}

function metaPath(name: string): string {
  return path.join(projectDir(name), META_FILE);
}

export async function readDoc(name: string, doc: DocId): Promise<string> {
  const p = docPath(name, doc);
  try {
    return await fsp.readFile(p, "utf8");
  } catch (err: any) {
    if (err && err.code === "ENOENT") return "";
    throw err;
  }
}

export async function readMeta(name: string): Promise<ProjectMeta> {
  const p = metaPath(name);
  const raw = await fsp.readFile(p, "utf8");
  const parsed = JSON.parse(raw);
  return parsed as ProjectMeta;
}

export async function writeMeta(
  name: string,
  meta: ProjectMeta,
): Promise<void> {
  const dir = projectDir(name);
  await fsp.mkdir(dir, { recursive: true });
  const p = metaPath(name);
  const tmp = `${p}.tmp`;
  const data = JSON.stringify(meta, null, 2);
  await fsp.writeFile(tmp, data, "utf8");
  await fsp.rename(tmp, p);
}

async function loadOrInitMeta(name: string): Promise<ProjectMeta> {
  try {
    const m = await readMeta(name);
    if (m && typeof m === "object") return m;
  } catch {
    // fall through to init
  }
  const now = Date.now();
  const fresh: ProjectMeta = {
    schemaVersion: SCHEMA_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
  } as ProjectMeta;
  return fresh;
}

export async function writeDoc(
  name: string,
  doc: DocId,
  content: string,
): Promise<void> {
  const dir = projectDir(name);
  await fsp.mkdir(dir, { recursive: true });
  const p = docPath(name, doc);
  const tmp = `${p}.tmp`;
  await fsp.writeFile(tmp, content, "utf8");
  await fsp.rename(tmp, p);

  const meta = await loadOrInitMeta(name);
  const next: ProjectMeta = {
    ...(meta as any),
    schemaVersion:
      (meta as any).schemaVersion === undefined
        ? SCHEMA_VERSION
        : (meta as any).schemaVersion,
    name: (meta as any).name ?? name,
    createdAt: (meta as any).createdAt ?? Date.now(),
    updatedAt: Date.now(),
  } as ProjectMeta;
  await writeMeta(name, next);
}

export async function appendDoc(
  name: string,
  doc: DocId,
  content: string,
): Promise<void> {
  await withMutex(name, String(doc), async () => {
    const existing = await readDoc(name, doc);
    const joined =
      existing.length === 0
        ? content
        : existing.endsWith("\n")
          ? existing + content
          : existing + "\n" + content;
    await writeDoc(name, doc, joined);
  });
}

// ---- Per (name+doc) async mutex ----

const mutexMap: Map<string, Promise<unknown>> = new Map();

export async function withMutex<T>(
  name: string,
  doc: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `${name}::${doc}`;
  const prev = mutexMap.get(key) ?? Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  mutexMap.set(key, next);
  try {
    return await next;
  } finally {
    if (mutexMap.get(key) === next) {
      mutexMap.delete(key);
    }
  }
}
