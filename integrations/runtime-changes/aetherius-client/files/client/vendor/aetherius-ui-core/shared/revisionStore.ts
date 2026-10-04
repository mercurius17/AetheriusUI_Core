export type Snapshot<T> = { revision: number; value: T };
export type Patch<TPatch> = { baseRevision: number; revision: number; patch: TPatch };

export class RevisionStore<T> {
  private current: Snapshot<T> | null = null;

  get snapshot(): Snapshot<T> | null {
    return this.current;
  }

  replace(snapshot: Snapshot<T>): boolean {
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) return false;
    if (this.current && snapshot.revision < this.current.revision) return false;
    this.current = { revision: snapshot.revision, value: snapshot.value };
    return true;
  }

  applyPatch<TPatch>(
    message: Patch<TPatch>,
    apply: (current: T, patch: TPatch) => T,
  ): "applied" | "gap" | "invalid" {
    if (!Number.isSafeInteger(message.revision) || !Number.isSafeInteger(message.baseRevision) ||
        message.revision <= message.baseRevision) return "invalid";
    if (!this.current || this.current.revision !== message.baseRevision) return "gap";
    this.current = { revision: message.revision, value: apply(this.current.value, message.patch) };
    return "applied";
  }

  clear(): void {
    this.current = null;
  }
}

export class RequestDeduplicator<T> {
  private readonly entries = new Map<string, { expiresAt: number; value: T }>();

  constructor(private readonly maxEntries = 512, private readonly ttlMs = 120_000) {}

  read(key: string, now = Date.now()): T | undefined {
    this.prune(now);
    const item = this.entries.get(key);
    return item?.value;
  }

  remember(key: string, value: T, now = Date.now()): boolean {
    this.prune(now);
    if (this.entries.has(key)) return false;
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    for (const [key, item] of this.entries) {
      if (item.expiresAt <= now) this.entries.delete(key);
    }
  }
}
