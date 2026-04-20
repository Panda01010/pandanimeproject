import { EventEmitter } from 'events';

export interface ProgressEvent {
  pipeline: string;       // e.g. 'character', 'grid', 'extraction', 'video'
  label: string;          // e.g. 'Verifying prompt match...'
  step: number;           // current step (1-based)
  total: number;          // total steps
  pct: number;            // 0–100
  subLabel?: string;      // optional extra info e.g. "Shot 3 of 9"
  done?: boolean;         // true = pipeline finished (success)
  error?: boolean;        // true = pipeline finished with error
}

// Use a plain EventEmitter — no overloads needed
class ProgressEmitterSingleton extends EventEmitter {
  send(data: ProgressEvent) {
    this.emit('progress', data);
  }
}

// Singleton — shared across all imports in the same Node.js process
const globalKey = '__panda_progress_emitter__';
const g = global as unknown as Record<string, ProgressEmitterSingleton>;
if (!g[globalKey]) {
  g[globalKey] = new ProgressEmitterSingleton();
  g[globalKey].setMaxListeners(50);
}

export const progressEmitter: ProgressEmitterSingleton = g[globalKey];

/** Convenience helper used throughout BrowserManager and route.ts */
export function emitProgress(data: ProgressEvent) {
  progressEmitter.send(data);
}
