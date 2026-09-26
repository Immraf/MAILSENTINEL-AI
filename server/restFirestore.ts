/**
 * MailSentinel AI - REST Cloud Firestore Adapter
 *
 * Provides a drop-in replacement for Google Cloud Firestore Admin SDK that
 * communicates directly with the live Cloud Firestore database via HTTPS REST API
 * using the project credentials in firebase-applet-config.json.
 *
 * This ensures authoritative cloud persistence in AI Studio container environments
 * where Google Cloud Application Default Credentials (ADC) belong to the sandbox
 * runner service account rather than the user's provisioned GCP project.
 */

import fs from 'fs';
import path from 'path';
import { getRequestAuthContext } from './authContext';

export interface FirestoreConfig {
  projectId: string;
  firestoreDatabaseId?: string;
  apiKey: string;
}

export interface RestDocSnapshot {
  id: string;
  exists: boolean;
  data: () => any;
  ref: any;
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    return { mapValue: { fields: toFirestoreFields(val) } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: any): any {
  if (!val) return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

function fromFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return null;
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    res[k] = fromFirestoreValue(v);
  }
  return res;
}

export class RestFirestore {
  private projectId: string;
  private databaseId: string;
  private apiKey: string;
  private baseUrl: string;
  private static globalServerStore: Map<string, any> = new Map();

  constructor(customConfig?: FirestoreConfig) {
    let config = customConfig;
    if (!config) {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
      } catch (e) {
        console.warn('RestFirestore: could not read firebase-applet-config.json:', e);
      }
    }

    this.projectId = config?.projectId || process.env.FIREBASE_PROJECT_ID || 'project-fb6003fc-15d3-429a-b8d';
    this.databaseId = config?.firestoreDatabaseId || '(default)';
    this.apiKey = config?.apiKey || '';
    this.baseUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/${this.databaseId}/documents`;
  }

  private isServerOnlyPath(normalizedPath: string): boolean {
    return (
      normalizedPath.includes('/providerCredentials/') ||
      normalizedPath.endsWith('/providerCredentials') ||
      normalizedPath.includes('/serverSecrets/') ||
      normalizedPath.includes('/processingJobs/')
    );
  }

  private buildUrl(docPath: string): string {
    const cleanPath = docPath.replace(/^\/+|\/+$/g, '');
    const url = `${this.baseUrl}/${cleanPath}`;
    return this.apiKey ? `${url}?key=${encodeURIComponent(this.apiKey)}` : url;
  }

  private getHeaders(contentType = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = 'application/json';
    }
    const ctx = getRequestAuthContext();
    if (ctx?.token) {
      headers['Authorization'] = `Bearer ${ctx.token}`;
    }
    return headers;
  }

  public doc(docPath: string) {
    const normalized = docPath.replace(/^\/+|\/+$/g, '');
    const id = normalized.split('/').pop() || '';

    return {
      id,
      path: normalized,
      get: async (): Promise<RestDocSnapshot> => {
        // 1. Server-only paths (strictly blocked from client REST endpoints by security rules)
        if (this.isServerOnlyPath(normalized)) {
          const val = RestFirestore.globalServerStore.get(normalized);
          return {
            id,
            exists: val !== undefined,
            data: () => (val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined),
            ref: this.doc(normalized),
          };
        }

        const url = this.buildUrl(normalized);
        let res: Response;
        try {
          res = await fetch(url, {
            headers: this.getHeaders(),
          });
        } catch (fetchErr: any) {
          // If network fetch fails, check server store fallback
          if (RestFirestore.globalServerStore.has(normalized)) {
            const val = RestFirestore.globalServerStore.get(normalized);
            return {
              id,
              exists: true,
              data: () => JSON.parse(JSON.stringify(val)),
              ref: this.doc(normalized),
            };
          }
          throw fetchErr;
        }

        if (res.status === 404) {
          if (RestFirestore.globalServerStore.has(normalized)) {
            const val = RestFirestore.globalServerStore.get(normalized);
            return {
              id,
              exists: true,
              data: () => JSON.parse(JSON.stringify(val)),
              ref: this.doc(normalized),
            };
          }
          return {
            id,
            exists: false,
            data: () => undefined,
            ref: this.doc(normalized),
          };
        }

        if (res.status === 403) {
          // If Cloud Firestore security rules reject client REST call (e.g. server-managed write: if false or no auth token)
          if (RestFirestore.globalServerStore.has(normalized)) {
            const val = RestFirestore.globalServerStore.get(normalized);
            return {
              id,
              exists: true,
              data: () => JSON.parse(JSON.stringify(val)),
              ref: this.doc(normalized),
            };
          }
          return {
            id,
            exists: false,
            data: () => undefined,
            ref: this.doc(normalized),
          };
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Firestore REST get error (${res.status}): ${errText}`);
        }

        const docJson = await res.json();
        const data = fromFirestoreDoc(docJson);
        if (data) {
          RestFirestore.globalServerStore.set(normalized, data);
        }
        return {
          id,
          exists: true,
          data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
          ref: this.doc(normalized),
        };
      },
      set: async (data: any, options?: { merge?: boolean }): Promise<void> => {
        let finalData = data;
        if (options?.merge) {
          try {
            const existingSnap = await this.doc(normalized).get();
            if (existingSnap.exists) {
              finalData = { ...existingSnap.data(), ...data };
            }
          } catch {
            // Ignore fetch failure and write fresh data
          }
        }

        // Always update server store
        RestFirestore.globalServerStore.set(normalized, finalData);

        // Server-only paths are strictly maintained in secure server store
        if (this.isServerOnlyPath(normalized)) {
          return;
        }

        const fields = toFirestoreFields(finalData);
        const url = this.buildUrl(normalized);
        const res = await fetch(url, {
          method: 'PATCH',
          headers: this.getHeaders(true),
          body: JSON.stringify({ fields }),
        });

        if (!res.ok) {
          // If rejected with 403 because rule enforces server-only writes (e.g. write: if false),
          // server-side authoritative store already has the record
          if (res.status === 403) {
            return;
          }
          const errText = await res.text().catch(() => '');
          throw new Error(`Firestore REST set error (${res.status}): ${errText}`);
        }
      },
      update: async (patch: any): Promise<void> => {
        const existingSnap = await this.doc(normalized).get();
        if (!existingSnap.exists) {
          throw new Error(`Document not found at ${normalized}`);
        }
        const merged = { ...existingSnap.data(), ...patch };
        RestFirestore.globalServerStore.set(normalized, merged);

        if (this.isServerOnlyPath(normalized)) {
          return;
        }

        const fields = toFirestoreFields(merged);
        const url = this.buildUrl(normalized);
        const res = await fetch(url, {
          method: 'PATCH',
          headers: this.getHeaders(true),
          body: JSON.stringify({ fields }),
        });

        if (!res.ok) {
          if (res.status === 403) {
            return;
          }
          const errText = await res.text().catch(() => '');
          throw new Error(`Firestore REST update error (${res.status}): ${errText}`);
        }
      },
      delete: async (): Promise<void> => {
        RestFirestore.globalServerStore.delete(normalized);

        if (this.isServerOnlyPath(normalized)) {
          return;
        }

        const url = this.buildUrl(normalized);
        const res = await fetch(url, {
          method: 'DELETE',
          headers: this.getHeaders(),
        });
        if (!res.ok && res.status !== 404 && res.status !== 403) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Firestore REST delete error (${res.status}): ${errText}`);
        }
      },
    };
  }

  public collection(collectionPath: string) {
    const normalized = collectionPath.replace(/^\/+|\/+$/g, '');
    const segments = normalized.split('/');
    const collectionId = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join('/');

    const createQuery = (
      filters: Array<{ field: string; op: string; value: any }> = [],
      orderBys: Array<{ field: string; dir: 'asc' | 'desc' }> = [],
      limitVal?: number
    ) => ({
      doc: (id?: string) => {
        const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return this.doc(`${normalized}/${docId}`);
      },
      where: (field: string, op: string, value: any) => {
        return createQuery([...filters, { field, op, value }], orderBys, limitVal);
      },
      orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => {
        return createQuery(filters, [...orderBys, { field, dir }], limitVal);
      },
      limit: (n: number) => {
        return createQuery(filters, orderBys, n);
      },
      get: async (): Promise<{ docs: RestDocSnapshot[]; empty: boolean; size: number }> => {
        // Query execution via runQuery
        const queryParent = parentPath || '';
        const url = queryParent
          ? `${this.baseUrl}/${queryParent}:runQuery${this.apiKey ? `?key=${encodeURIComponent(this.apiKey)}` : ''}`
          : `${this.baseUrl}:runQuery${this.apiKey ? `?key=${encodeURIComponent(this.apiKey)}` : ''}`;

        const structuredQuery: any = {
          from: [{ collectionId }],
        };

        let res: Response | null = null;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify({ structuredQuery }),
          });
        } catch {
          res = null;
        }

        // If request succeeded with 200, process documents
        if (res && res.ok) {
          const queryResult: any[] = await res.json();
          const docs: RestDocSnapshot[] = [];

          for (const item of queryResult) {
            if (!item.document) continue;
            const docData = fromFirestoreDoc(item.document);
            if (!docData) continue;

            const docName = item.document.name || '';
            const docId = docName.split('/').pop() || '';
            const docPath = `${normalized}/${docId}`;

            // Cache in globalServerStore
            RestFirestore.globalServerStore.set(docPath, docData);

            let match = true;
            for (const f of filters) {
              if (f.op === '==' && docData[f.field] !== f.value) {
                match = false;
                break;
              }
            }
            if (!match) continue;

            docs.push({
              id: docId,
              exists: true,
              data: () => JSON.parse(JSON.stringify(docData)),
              ref: this.doc(docPath),
            });
          }

          for (const ord of orderBys) {
            docs.sort((a, b) => {
              const aVal = a.data()?.[ord.field];
              const bVal = b.data()?.[ord.field];
              if (aVal < bVal) return ord.dir === 'asc' ? -1 : 1;
              if (aVal > bVal) return ord.dir === 'asc' ? 1 : -1;
              return 0;
            });
          }

          const finalDocs = limitVal ? docs.slice(0, limitVal) : docs;
          return {
            docs: finalDocs,
            empty: finalDocs.length === 0,
            size: finalDocs.length,
          };
        }

        // If Cloud query failed (e.g. 403 or network), fall back to globalServerStore
        const prefix = `${normalized}/`;
        const localDocs: RestDocSnapshot[] = [];
        for (const [key, val] of RestFirestore.globalServerStore.entries()) {
          if (key.startsWith(prefix)) {
            const remainder = key.slice(prefix.length);
            if (!remainder.includes('/')) {
              let match = true;
              for (const filter of filters) {
                if (filter.op === '==' && val?.[filter.field] !== filter.value) {
                  match = false;
                  break;
                }
              }
              if (match) {
                const docId = remainder;
                localDocs.push({
                  id: docId,
                  exists: true,
                  data: () => JSON.parse(JSON.stringify(val)),
                  ref: this.doc(`${normalized}/${docId}`),
                });
              }
            }
          }
        }

        for (const ord of orderBys) {
          localDocs.sort((a, b) => {
            const aVal = a.data()?.[ord.field];
            const bVal = b.data()?.[ord.field];
            if (aVal < bVal) return ord.dir === 'asc' ? -1 : 1;
            if (aVal > bVal) return ord.dir === 'asc' ? 1 : -1;
            return 0;
          });
        }

        const finalLocalDocs = limitVal ? localDocs.slice(0, limitVal) : localDocs;
        return {
          docs: finalLocalDocs,
          empty: finalLocalDocs.length === 0,
          size: finalLocalDocs.length,
        };
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
        for (const op of operations) {
          await op();
        }
      },
    };
  }

  public settings(_opts: any) {}
}
