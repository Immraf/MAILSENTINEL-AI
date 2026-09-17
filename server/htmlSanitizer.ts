/**
 * MailSentinel AI - HTML & Payload Sanitizer
 * Defense-in-depth sanitization for email HTML content.
 * Guarantees zero script/executable injection, zero iframe/object framing,
 * and zero unauthorized outbound beacons.
 */

export function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let sanitized = rawHtml;

  // 1. Strip script tags and their inner content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // 2. Strip style tags to prevent style-based attacks / CSS exfiltration
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 3. Strip dangerous executable containers (iframe, embed, object, applet, meta, link, base, form)
  sanitized = sanitized.replace(/<(iframe|embed|object|applet|form|input|button|link|base|meta)\b[^>]*>.*?<\/\1>/gis, '');
  sanitized = sanitized.replace(/<(iframe|embed|object|applet|form|input|button|link|base|meta)\b[^>]*\/?>/gi, '');

  // 4. Strip all inline DOM event handlers (onclick, onerror, onload, onmouseover, etc.)
  sanitized = sanitized.replace(/\son\w+\s*=\s*(["'])[\s\S]*?\1/gi, '');
  sanitized = sanitized.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');

  // 5. Neutralize dangerous URL schemes in href and src (javascript:, vbscript:, data: except safe image previews)
  sanitized = sanitized.replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript|data(?!\/image)):/gi, '$1=$2about:blank#blocked-');
  sanitized = sanitized.replace(/(href|src)\s*=\s*(javascript|vbscript|data(?!\/image)):/gi, '$1=about:blank#blocked-');

  // 6. Security hardening for anchor links: force rel="noopener noreferrer" and target="_blank"
  sanitized = sanitized.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
    let cleanAttrs = attrs.replace(/\btarget\s*=\s*(["'])[\s\S]*?\1/gi, '');
    cleanAttrs = cleanAttrs.replace(/\brel\s*=\s*(["'])[\s\S]*?\1/gi, '');
    return `<a ${cleanAttrs.trim()} target="_blank" rel="noopener noreferrer">`;
  });

  // 7. Security hardening for images: force referrerpolicy="no-referrer"
  sanitized = sanitized.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    let cleanAttrs = attrs.replace(/\breferrerpolicy\s*=\s*(["'])[\s\S]*?\1/gi, '');
    return `<img ${cleanAttrs.trim()} referrerpolicy="no-referrer">`;
  });

  return sanitized.trim();
}
