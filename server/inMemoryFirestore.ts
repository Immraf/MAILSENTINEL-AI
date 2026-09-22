/**
 * MailSentinel AI - In-Memory Firestore Mock for Test & Headless Verification
 *
 * Implements Google Cloud Firestore Admin SDK DocumentReference, CollectionReference,
 * and Query interfaces in memory for testing without external cloud network dependencies.
 *
 * Documents are isolated under their full hierarchical path:
 * e.g. "users/{userId}/emailAccounts/{accountId}"
 */

export interface MockDocSnapshot {
  id: string;
  exists: boolean;
  data: () => any;
  ref: any;
}

export class InMemoryFirestore {
  private store: Map<string, any> = new Map();
  private simulateFailure = false;

  public setSimulateFailure(fail: boolean) {
    this.simulateFailure = fail;
  }

  private checkFailure(operation: string) {
    if (this.simulateFailure) {
      const err: any = new Error(`7 PERMISSION_DENIED: Cloud Firestore API simulated failure on ${operation}`);
      err.code = 7;
      throw err;
    }
  }

  public doc(docPath: string) {
    const normalized = docPath.replace(/^\/+|\/+$/g, '');
    const id = normalized.split('/').pop() || '';

    return {
      id,
      path: normalized,
      get: async (): Promise<MockDocSnapshot> => {
        this.checkFailure('doc.get');
        const val = this.store.get(normalized);
        return {
          id,
          exists: val !== undefined,
          data: () => (val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined),
          ref: this.doc(normalized),
        };
      },
      set: async (data: any, options?: { merge?: boolean }): Promise<void> => {
        this.checkFailure('doc.set');
        if (options?.merge && this.store.has(normalized)) {
          const prev = this.store.get(normalized);
          this.store.set(normalized, { ...prev, ...JSON.parse(JSON.stringify(data)) });
        } else {
          this.store.set(normalized, JSON.parse(JSON.stringify(data)));
        }
      },
      update: async (patch: any): Promise<void> => {
        this.checkFailure('doc.update');
        if (!this.store.has(normalized)) {
          throw new Error(`Document not found at ${normalized}`);
        }
        const prev = this.store.get(normalized);
        this.store.set(normalized, { ...prev, ...JSON.parse(JSON.stringify(patch)) });
      },
      delete: async (): Promise<void> => {
        this.checkFailure('doc.delete');
        this.store.delete(normalized);
      },
    };
  }

  public collection(collectionPath: string) {
    const normalized = collectionPath.replace(/^\/+|\/+$/g, '');

    const createQuery = (filters: Array<{ field: string; op: string; value: any }> = [], limitVal?: number) => ({
      doc: (id: string) => this.doc(`${normalized}/${id}`),
      where: (field: string, op: string, value: any) => {
        return createQuery([...filters, { field, op, value }], limitVal);
      },
      limit: (n: number) => {
        return createQuery(filters, n);
      },
      get: async (): Promise<{ docs: MockDocSnapshot[] }> => {
        this.checkFailure('collection.get');
        const prefix = `${normalized}/`;
        const docs: MockDocSnapshot[] = [];
        for (const [key, val] of this.store.entries()) {
          if (key.startsWith(prefix)) {
            const remainder = key.slice(prefix.length);
            // Must be immediate child, not sub-collection
            if (!remainder.includes('/')) {
              let match = true;
              for (const filter of filters) {
                if (filter.op === '==' && val?.[filter.field] !== filter.value) {
                  match = false;
                  break;
                }
              }
              if (match) {
                docs.push({
                  id: remainder,
                  exists: true,
                  data: () => JSON.parse(JSON.stringify(val)),
                  ref: this.doc(key),
                });
                if (limitVal && docs.length >= limitVal) break;
              }
            }
          }
        }
        return { docs };
      },
    });

    return createQuery();
  }

  public batch() {
    const operations: Array<() => Promise<void>> = [];
    return {
      set: (docRef: any, data: any, options?: { merge?: boolean }) => {
        operations.push(async () => {
          await docRef.set(data, options);
        });
        return this;
      },
      update: (docRef: any, patch: any) => {
        operations.push(async () => {
          await docRef.update(patch);
        });
        return this;
      },
      delete: (docRef: any) => {
        operations.push(async () => {
          await docRef.delete();
        });
        return this;
      },
      commit: async (): Promise<void> => {
        this.checkFailure('batch.commit');
        for (const op of operations) {
          await op();
        }
      },
    };
  }

  public settings(_opts: any) {}

  public clear(): void {
    this.store.clear();
    this.simulateFailure = false;
  }

  public getRawStore(): Map<string, any> {
    return this.store;
  }
}
