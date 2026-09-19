import { getFirebaseIdToken } from './firebase';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Authenticated API Fetch client
 * Automatically attaches: Authorization: Bearer <Firebase ID token>
 * If 401 is encountered, forces a token refresh via getIdToken(true) and retries once.
 */
export async function apiFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  // Retrieve current Firebase ID token
  const idToken = await getFirebaseIdToken(false);
  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
  }

  // Ensure JSON content type if body is a string and not set
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(input, {
    ...init,
    headers,
  });

  // If unauthorized and we had an active token, attempt a single refresh & retry
  if (response.status === 401 && idToken) {
    try {
      const refreshedToken = await getFirebaseIdToken(true);
      if (refreshedToken && refreshedToken !== idToken) {
        headers.set('Authorization', `Bearer ${refreshedToken}`);
        response = await fetch(input, {
          ...init,
          headers,
        });
      }
    } catch (refreshErr) {
      console.warn('Firebase ID token refresh failed:', refreshErr);
    }
  }

  return response;
}

/**
 * Helper to safely parse JSON without throwing "Unexpected token <" on HTML fallbacks
 */
export async function safeParseResponseJson<T = any>(res: Response): Promise<{ data: T | null; isJson: boolean; rawText: string }> {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return { data, isJson: true, rawText: text };
  } catch {
    return { data: null, isJson: false, rawText: text };
  }
}

/**
 * Helper to execute an authenticated JSON request
 */
export async function apiRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(url, options);
  const { data, isJson } = await safeParseResponseJson(res);

  if (res.status === 401) {
    const message = (isJson && data?.error?.message) || 'Authentication required';
    const code = (isJson && data?.error?.code) || 'UNAUTHENTICATED';
    const error = new Error(message);
    (error as any).code = code;
    (error as any).status = 401;
    throw error;
  }

  if (!res.ok) {
    const message = (isJson && data?.error?.message) || `API request failed with status ${res.status}`;
    const code = (isJson && data?.error?.code) || 'API_ERROR';
    const err = new Error(message);
    (err as any).code = code;
    (err as any).status = res.status;
    throw err;
  }

  return data as T;
}
