/** Browser/API contracts. Phase 2 will generate these from the Rust API schema. */
export type TaskStatus = 'pending' | 'analyzing' | 'working' | 'validating' | 'ready' | 'awaiting_feedback' | 'applying' | 'applied' | 'failed' | 'conflict' | 'rejected' | 'cancelled';
export interface ElementContext {
  url: string; route: string; selector: string; tagName: string; text: string;
  testId: string; ariaLabel: string; source: string; domSnippet?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
}
export interface Validation { command: string; passed: boolean; code: number; durationMs: number; output?: string }
export interface Revision {
  attempt: number; status: TaskStatus; diff: string; files: string[];
  validation: Validation[]; updatedAt: string; baseCommit: string; baseBranch: string; error?: string | null;
}
export interface Task extends Revision {
  id: string; agent: string; request: string; context: ElementContext; createdAt: string; cleanupWarning?: string;
  messages?: Array<{ id: number; role: 'user' | 'assistant'; content: string; attempt: number; at: string }>;
  history?: Array<{ id: number; action: string; at: string }>;
  revisions?: Array<Omit<Revision, 'diff' | 'validation'> & { checks: number; passed: boolean }>;
}
export type TaskSummary = Omit<Task, 'diff' | 'messages' | 'history' | 'revisions'>;
export type TaskEvent = TaskSummary | { id: string; deleted: true };
export interface AgentDescriptor {
  id: string; label: string; transport: string;
  capabilities: { automatic: boolean; streaming: boolean; resume: boolean; images: boolean };
}
export interface ServerStatus {
  repository: { branch: string; head: string }; agent: string; agents?: AgentDescriptor[]; playgroundUrl?: string | null;
}
export type Api = <T>(path: string, options?: RequestInit) => Promise<T>;
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
export function query<E extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): E {
  const result = root.querySelector<E>(selector);
  if (!result) throw new Error(`Missing UI element: ${selector}`);
  return result;
}
