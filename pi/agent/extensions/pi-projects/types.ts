export type DocId =
  | "charter"
  | "backlog"
  | "journal"
  | "lessons"
  | "decisions"
  | "glossary"
  | "conventions";

export const APPENDABLE_DOCS: readonly DocId[] = [
  "journal",
  "lessons",
  "decisions",
  "glossary",
  "conventions",
] as const;

export interface ProjectMeta {
  name: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export interface Todo {
  id: number;
  text: string;
  status: "open" | "done" | "blocked";
  createdAt: number;
  completedAt?: number;
}

export interface BindingEntry {
  projectName: string;
  ts: number;
  version: 1;
}

export interface AppendOptions {
  title?: string;
}
