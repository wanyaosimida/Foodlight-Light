export type HealthDataKind = 'meal' | 'weight';

type Listener = (kind: HealthDataKind) => void;

const listeners = new Set<Listener>();

export function notifyHealthDataChanged(kind: HealthDataKind): void {
  for (const listener of listeners) listener(kind);
}

export function subscribeHealthDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
