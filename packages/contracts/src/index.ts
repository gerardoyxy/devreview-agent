/** Browser/API contracts shared by the TypeScript clients; exercised against the Rust HTTP API. */
export type TaskStatus = 'draft' | 'pending' | 'analyzing' | 'preparing' | 'working' | 'validating' | 'ready' | 'awaiting_feedback' | 'undoing' | 'applying' | 'applied' | 'undone' | 'recovery_required' | 'failed' | 'conflict' | 'rejected' | 'cancelled';
export type TaskKind = 'frontend' | 'backend' | 'tests' | 'documentation' | 'general';
export interface ElementContext {
  url: string; route: string; selector: string; tagName: string; text: string;
  testId: string; ariaLabel: string; source: string; domSnippet?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  sourceVerified?: boolean;
}
export interface Validation { command: string; passed: boolean; code: number; durationMs: number; output?: string }
export interface Revision {
  projectContext?: ContextSnapshot | null;
  attempt: number; status: TaskStatus; diff: string; files: string[];
  validation: Validation[]; updatedAt: string; baseCommit: string; baseBranch: string; error?: string | null;
  validationStatus?: 'not_run' | 'not_configured' | 'running' | 'passed' | 'failed';
  setupChecks?: Validation[];
  snapshotIncludesLocalChanges?: boolean;
  undo?: { before: unknown; after: unknown; at: string } | null;
}
export interface Task extends Revision {
  savedVersion?: boolean;
  versionSavePending?: boolean;
  id: string; agent: string; request: string; context: ElementContext; createdAt: string; cleanupWarning?: string;
  kind?: TaskKind; references?: string[];
  messages?: Array<{ id: number; role: 'user' | 'assistant'; content: string; attempt: number; at: string }>;
  history?: Array<{ id: number; action: string; at: string }>;
  revisions?: Array<Omit<Revision, 'diff' | 'validation' | 'projectContext'> & { checks: number; passed: boolean }>;
}
export type TaskSummary = Omit<Task, 'diff' | 'messages' | 'history' | 'revisions' | 'projectContext'>;
export type TaskEvent = TaskSummary | { id: string; deleted: true };
export interface AgentDescriptor {
  id: string; label: string; transport: string;
  capabilities: { automatic: boolean; streaming: boolean; resume: boolean; images: boolean };
}
export interface ServerStatus {
  repository: { branch: string; head: string }; agent: string; agents?: AgentDescriptor[]; playgroundUrl?: string | null;
  executionEnabled?: boolean; validationCommands?: string[]; setupCommands?: string[];
}
export interface Diagnostics {
  deviceBrowser: { available: boolean; browser: string | null };
  project: { frameworks: string[]; backends: string[]; packageManager: string; packageManagerAvailable: boolean; suggestedOrigin: string; warnings: string[]; suggestedSetup: string[]; suggestedValidation: string[] };
  gitAvailable: boolean; configurationExists: boolean; executionEnabled: boolean; validationConfigured: boolean;
  agents: Array<{ id: string; executableAvailable: boolean; authentication: string }>;
  setupCommands: string[]; validationCommands: string[]; allowedOrigins: string[]; note: string;
}
export type Api = <T>(path: string, options?: RequestInit) => Promise<T>;
export interface VersionChange { id: string; attempt: number; request: string; files: string[]; validationStatus?: Revision['validationStatus'] }
export interface VersionIdentity { name: string; email: string }
export interface SavedVersion { id: string; status: 'saving' | 'saved' | 'failed'; commit: string; branch: string; message: string; identity: VersionIdentity; at: string; changes: VersionChange[]; files: string[]; error?: string }
export interface Versions { repository: ServerStatus['repository']; pending: VersionChange[]; history: SavedVersion[]; identity: VersionIdentity }
export interface VersionPreview { id: string; repository: ServerStatus['repository']; changes: VersionChange[]; files: string[]; diff: string; suggestedMessage: string; identity: VersionIdentity; expiresInSeconds: number }
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
export function query<E extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): E {
  const result = root.querySelector<E>(selector);
  if (!result) throw new Error(`Missing UI element: ${selector}`);
  return result;
}

export interface ContextItem {
  id: string; kind: 'instruction' | 'skill' | 'document'; title: string; content: string;
  source: string; default: boolean; revision: number; updatedAt: string;
}
export interface ProjectContext { version: 1; revision: number; items: ContextItem[] }
export interface ContextSnapshot { version: 1; libraryRevision: number; capturedAt: string; items: ContextItem[] }
