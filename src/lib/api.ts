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
 * Strictly conforms to MailSentinel AI Authentication Foundation requirements.
 */
export async function apiFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  // Retrieve Firebase ID token if authenticated
  const idToken = await getFirebaseIdToken();
  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
  }

  // Ensure JSON content type if body is stringified JSON and not set
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

/**
 * Helper to execute an authenticated JSON request
 */
export async function apiRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(url, options);

  if (res.status === 401) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    }));
    const error = new Error(errorData.error?.message || 'Authentication required');
    (error as any).code = errorData.error?.code || 'UNAUTHENTICATED';
    (error as any).status = 401;
    throw error;
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message || `API request failed with status ${res.status}`;
    const err = new Error(message);
    (err as any).code = errBody?.error?.code || 'API_ERROR';
    (err as any).status = res.status;
    throw err;
  }

  return res.json();
}
