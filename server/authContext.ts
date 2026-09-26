/**
 * MailSentinel AI - Request Auth Context Storage
 * 
 * Provides AsyncLocalStorage context to propagate verified Firebase user ID tokens
 * from incoming authenticated API requests down into RestFirestore adapters.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestAuthContext {
  token?: string;
  uid?: string;
}

export const requestAuthStorage = new AsyncLocalStorage<RequestAuthContext>();

export function getRequestAuthContext(): RequestAuthContext | undefined {
  return requestAuthStorage.getStore();
}

export function runWithRequestAuth<T>(context: RequestAuthContext, fn: () => T): T {
  return requestAuthStorage.run(context, fn);
}
