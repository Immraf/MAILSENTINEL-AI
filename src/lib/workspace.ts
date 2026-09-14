import { GoogleCalendarEvent, GoogleDriveFile, GoogleTaskItem } from '../types';

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

/**
 * GMAIL API INTEGRATION
 */

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  labelIds: string[];
}

export async function fetchGmailMessages(
  accessToken: string,
  maxResults = 25,
  query = 'label:INBOX'
): Promise<GmailMessageSummary[]> {
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gmail API error (${res.status}): ${errorText}`);
  }

  const listData = await res.json();
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  // Fetch individual messages details in parallel batches of 5
  const results: GmailMessageSummary[] = [];
  const messageIds: string[] = listData.messages.map((m: any) => m.id);

  const batchSize = 5;
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const batchPromises = batch.map(async (id) => {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        if (!msgRes.ok) return null;
        const msgData = await msgRes.json();
        return parseGmailMessage(msgData);
      } catch (err) {
        console.warn(`Failed to fetch message ${id}`, err);
        return null;
      }
    });

    const parsedBatch = await Promise.all(batchPromises);
    parsedBatch.forEach((item) => {
      if (item) results.push(item);
    });
  }

  return results;
}

function parseGmailMessage(raw: any): GmailMessageSummary {
  const headers = raw.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = getHeader('Subject') || '(No Subject)';
  const from = getHeader('From') || 'Unknown Sender';
  const to = getHeader('To') || '';
  const date = getHeader('Date') || new Date().toISOString();

  // Extract body parts recursively
  let bodyText = '';
  let bodyHtml = '';

  function extractParts(part: any) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      bodyText += decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      bodyHtml += decodeBase64Url(part.body.data);
    }
    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(extractParts);
    }
  }

  if (raw.payload?.body?.data) {
    if (raw.payload.mimeType === 'text/html') {
      bodyHtml = decodeBase64Url(raw.payload.body.data);
    } else {
      bodyText = decodeBase64Url(raw.payload.body.data);
    }
  } else if (raw.payload?.parts) {
    raw.payload.parts.forEach(extractParts);
  }

  if (!bodyText && bodyHtml) {
    // Strip HTML tags for text representation
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = bodyHtml;
    bodyText = tempDiv.textContent || tempDiv.innerText || '';
  }

  return {
    id: raw.id,
    threadId: raw.threadId,
    subject,
    from,
    to,
    date,
    snippet: raw.snippet || '',
    bodyText: bodyText.slice(0, 10000),
    bodyHtml: bodyHtml || undefined,
    labelIds: raw.labelIds || [],
  };
}

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    try {
      return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return str;
    }
  }
}

/**
 * GOOGLE CALENDAR API INTEGRATION
 */

export async function fetchCalendarEvents(
  accessToken: string,
  maxResults = 20
): Promise<GoogleCalendarEvent[]> {
  const now = new Date().toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    now
  )}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary || '(Untitled Event)',
    description: item.description,
    start: item.start || {},
    end: item.end || {},
    location: item.location,
    htmlLink: item.htmlLink,
  }));
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    location?: string;
  }
): Promise<GoogleCalendarEvent> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startDateTime },
      end: { dateTime: event.endDateTime },
      location: event.location,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create calendar event (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    summary: data.summary,
    description: data.description,
    start: data.start,
    end: data.end,
    location: data.location,
    htmlLink: data.htmlLink,
  };
}

/**
 * GOOGLE TASKS API INTEGRATION
 */

export async function fetchGoogleTasks(accessToken: string): Promise<GoogleTaskItem[]> {
  // First get or use default tasklist
  const listRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Google Tasks API error: ${err}`);
  }

  const listData = await listRes.json();
  const taskListId = listData.items?.[0]?.id || '@default';

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks?showCompleted=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list tasks: ${err}`);
  }

  const data = await res.json();
  return (data.items || []).map((t: any) => ({
    id: t.id,
    title: t.title || '(No Title)',
    notes: t.notes,
    due: t.due,
    status: t.status === 'completed' ? 'completed' : 'needsAction',
    updated: t.updated,
  }));
}

export async function createGoogleTask(
  accessToken: string,
  task: {
    title: string;
    notes?: string;
    due?: string; // RFC 3339 timestamp
  }
): Promise<GoogleTaskItem> {
  const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: task.title,
      notes: task.notes,
      due: task.due,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create task (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    title: data.title,
    notes: data.notes,
    due: data.due,
    status: data.status === 'completed' ? 'completed' : 'needsAction',
    updated: data.updated,
  };
}

/**
 * GOOGLE DRIVE & PICKER INTEGRATION
 */

export async function fetchDriveFiles(accessToken: string, maxResults = 20): Promise<GoogleDriveFile[]> {
  const url = `https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType,webViewLink,iconLink,size,description)&q=trashed=false`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Drive API error: ${err}`);
  }

  const data = await res.json();
  return data.files || [];
}

export async function saveSummaryToGoogleDrive(
  accessToken: string,
  title: string,
  content: string
): Promise<{ fileId: string; webViewLink?: string }> {
  const metadata = {
    name: `${title}.txt`,
    mimeType: 'text/plain',
    description: 'Generated by MailSentinel AI Assistant',
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', new Blob([content], { type: 'text/plain' }));

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to save to Google Drive (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { fileId: data.id, webViewLink: data.webViewLink };
}

/**
 * Open Google Picker widget with OAuth token
 */
export function openGooglePicker(
  accessToken: string,
  onPicked: (file: { id: string; name: string; url: string; mimeType: string }) => void,
  onCancel?: () => void
): boolean {
  if (typeof window === 'undefined') return false;

  const buildAndShow = () => {
    try {
      if (!window.google?.picker) {
        console.warn('Google Picker library not yet loaded');
        return false;
      }

      const pickerOrigin =
        window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
          ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
          : window.location.origin;

      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED && data.docs?.[0]) {
            const doc = data.docs[0];
            onPicked({
              id: doc.id,
              name: doc.name,
              url: doc.url,
              mimeType: doc.mimeType,
            });
          } else if (data.action === window.google.picker.Action.CANCEL) {
            if (onCancel) onCancel();
          }
        })
        .setOrigin(pickerOrigin)
        .setSize(750, 480)
        .build();

      picker.setVisible(true);
      return true;
    } catch (err) {
      console.error('Error opening Google Picker:', err);
      return false;
    }
  };

  if (window.google?.picker) {
    return buildAndShow();
  } else if (window.gapi?.load) {
    window.gapi.load('picker', {
      callback: () => buildAndShow(),
    });
    return true;
  }

  return false;
}
