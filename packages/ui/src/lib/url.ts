import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

type DesktopBridgeGlobal = {
  openExternal?: (url: string) => Promise<unknown>;
};

const hasControlCharacters = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
};

const hasNonWhitespaceControlCharacters = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
};

const hasUnsafeRawCharacters = (value: string): boolean => /\s/.test(value) || value.includes('\\') || value.includes('"');

const EXPLICIT_HIERARCHICAL_HTTP_RE = /^https?:\/\/[^/?#\\]/i;
const EXPLICIT_HIERARCHICAL_CUSTOM_RE = /^[a-z][a-z0-9+.-]{1,31}:\/\/[^/?#\\]/i;
const ENCODED_CONTROL_BYTE_RE = /%([01][0-9a-f]|7f)/i;
const ENCODED_AUTHORITY_DELIMITER_RE = /%(?:2f|3f|23|5c|40)/i;
const ALLOWED_MAILTO_QUERY_KEYS = new Set(['to', 'cc', 'bcc', 'subject', 'body', 'in-reply-to', 'references']);

const parseUrlSafely = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const isExternalHttpUrl = (url: string): boolean => {
  if (hasControlCharacters(url)) {
    return false;
  }
  const trimmed = url.trim();
  if (!trimmed || !EXPLICIT_HIERARCHICAL_HTTP_RE.test(trimmed) || trimmed.includes('\\')) {
    return false;
  }
  const parsed = parseUrlSafely(trimmed);
  if (!parsed) {
    return false;
  }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
};

export const isMailtoUrl = (url: string): boolean => {
  if (hasControlCharacters(url)) {
    return false;
  }
  const trimmed = url.trim();
  if (!trimmed || /^mailto:\/\//i.test(trimmed) || hasUnsafeRawCharacters(trimmed)) {
    return false;
  }
  const parsed = parseUrlSafely(trimmed);
  if (!parsed || parsed.protocol !== 'mailto:') {
    return false;
  }
  if (!parsed.pathname.trim() && parsed.searchParams.size === 0) {
    return false;
  }
  if (ENCODED_CONTROL_BYTE_RE.test(parsed.pathname) || ENCODED_CONTROL_BYTE_RE.test(parsed.hash)) {
    return false;
  }
  for (const [key, value] of parsed.searchParams.entries()) {
    const normalizedKey = key.toLowerCase();
    if (!ALLOWED_MAILTO_QUERY_KEYS.has(normalizedKey)) {
      return false;
    }
    const badValue = normalizedKey === 'body'
      ? hasNonWhitespaceControlCharacters(value)
      : hasControlCharacters(value);
    if (badValue) {
      return false;
    }
  }
  const serialized = parsed.toString();
  return !hasControlCharacters(serialized) && !hasUnsafeRawCharacters(serialized);
};

export const getUrlScheme = (url: string): string | null => {
  const parsed = parseUrlSafely(url.trim());
  if (!parsed) {
    return null;
  }
  return parsed.protocol.replace(/:$/, '').toLowerCase();
};

const BROWSER_HANDLED_SCHEMES = new Set([
  'http', 'https', 'mailto', 'tel', 'sms', 'callto', 'cid', 'xmpp', 'irc', 'ircs', 'news', 'snews', 'nntp', 'feed', 'webcal',
]);

const BLOCKED_APP_LINK_SCHEMES = new Set([
  'javascript', 'data', 'vbscript', 'blob', 'filesystem', 'about',
  'chrome', 'chrome-extension', 'devtools', 'moz-extension', 'ms-browser-extension', 'microsoft-edge',
  'file',
  'ws', 'wss', 'ftp', 'ftps', 'gopher', 'tftp',
  'intent',
  'shell', 'search', 'search-ms', 'hcp', 'help', 'cmd', 'powershell',
  'smb', 'cifs', 'afp', 'afps', 'nfs', 'dav', 'davs', 'webdav', 'webdavs',
  'ssh', 'sftp', 'svn+ssh', 'git+ssh', 'ssh+git',
  'rdp', 'vnc', 'telnet', 'rlogin', 'rsh', 'rexec', 'ldap', 'ldaps',
  'its', 'mhtml', 'mk', 'res', 'jar', 'jnlp', 'view-source',
  'applescript', 'shortcuts', 'x-man-page', 'x-apple.systempreferences', 'itms-services',
  'openchamber', 'openchamber-ui', 'openchamber-diff', 'capacitor',
  'command', 'vscode-remote', 'vscode-userdata', 'vscode-file', 'vscode-vfs',
  'vscode-webview', 'vscode-resource', 'vscode-notebook-cell', 'vscode-notebook-output',
  'vscode-terminal', 'vscode-settings', 'vscode-local-history',
  'untitled', 'walkthrough', 'output', 'debug', 'git',
]);

const APP_LINK_SCHEME_RE = /^[a-z][a-z0-9+.-]{1,31}$/;

export const isAppLinkUrl = (url: string): boolean => {
  if (hasControlCharacters(url)) {
    return false;
  }
  const trimmed = url.trim();
  if (
    !trimmed
    || !EXPLICIT_HIERARCHICAL_CUSTOM_RE.test(trimmed)
    || hasUnsafeRawCharacters(trimmed)
    || ENCODED_CONTROL_BYTE_RE.test(trimmed)
  ) {
    return false;
  }
  const parsed = parseUrlSafely(trimmed);
  if (!parsed || !parsed.hostname || parsed.username || parsed.password) {
    return false;
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (
    !APP_LINK_SCHEME_RE.test(scheme)
    || scheme.startsWith('ms-')
    || BROWSER_HANDLED_SCHEMES.has(scheme)
    || BLOCKED_APP_LINK_SCHEMES.has(scheme)
  ) {
    return false;
  }
  const authority = trimmed.slice(scheme.length + 3).split(/[/?#]/, 1)[0];
  if (!authority || ENCODED_AUTHORITY_DELIMITER_RE.test(authority)) {
    return false;
  }
  const serialized = parsed.toString();
  return !hasControlCharacters(serialized) && !hasUnsafeRawCharacters(serialized);
};

export const getExternalFaviconUrl = (url: string): string | null => {
  const parsed = parseUrlSafely(url.trim());
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return null;
  }

  return `https://icons.duckduckgo.com/ip3/${parsed.hostname.toLowerCase()}.ico`;
};

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export const isLoopbackHttpUrl = (url: string): boolean => {
  const parsed = parseUrlSafely(url.trim());
  if (!parsed) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  return LOOPBACK_HOSTNAMES.has(hostname);
};

const LOOPBACK_URL_PATTERN
  // oxlint-disable-next-line no-control-regex
  = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{2,5})?(?:\/[^\s<>"'`\u0000-\u001f]*)?/gi;

export const extractLoopbackUrls = (text: string): string[] => {
  if (!text) {
    return [];
  }
  const matches = text.match(LOOPBACK_URL_PATTERN);
  if (!matches || matches.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[),.;:!?'"`]+$/g, '');
    if (!cleaned || !isLoopbackHttpUrl(cleaned)) {
      continue;
    }
    if (seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
};

const openMailtoInBrowser = (normalizedTarget: string): boolean => {
  try {
    if (globalThis.document?.createElement) {
      const anchor = globalThis.document.createElement('a');
      anchor.href = normalizedTarget;
      anchor.click();
      return true;
    }
    if (window.location?.assign) {
      window.location.assign(normalizedTarget);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

const openValidatedExternalUrl = async (url: string, kind: 'http' | 'mailto' | 'app'): Promise<boolean> => {
  if (typeof window === 'undefined') {
    return false;
  }

  const target = url.trim();
  if (!target) {
    return false;
  }

  const parsed = parseUrlSafely(target);
  if (!parsed) {
    return false;
  }

  const normalizedTarget = parsed.toString();

  const runtimeApis = getRegisteredRuntimeAPIs();
  if (runtimeApis?.runtime?.isVSCode && runtimeApis.vscode?.openExternalUrl) {
    try {
      await runtimeApis.vscode.openExternalUrl(normalizedTarget);
      return true;
    } catch {
      return false;
    }
  }

  const desktop = (window as unknown as { __OPENCHAMBER_DESKTOP__?: DesktopBridgeGlobal }).__OPENCHAMBER_DESKTOP__;
  if (desktop?.openExternal) {
    try {
      await desktop.openExternal(normalizedTarget);
      return true;
    } catch {
      if (kind !== 'http') return false;
    }
  }

  if (kind === 'mailto') {
    return openMailtoInBrowser(normalizedTarget);
  }

  try {
    window.open(normalizedTarget, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
};

export const openExternalUrl = (url: string): Promise<boolean> =>
  isExternalHttpUrl(url) ? openValidatedExternalUrl(url, 'http') : Promise.resolve(false);

export const openMailtoUrl = (url: string): Promise<boolean> =>
  isMailtoUrl(url) ? openValidatedExternalUrl(url, 'mailto') : Promise.resolve(false);

export const openConfirmedAppLinkUrl = (url: string): Promise<boolean> =>
  isAppLinkUrl(url) ? openValidatedExternalUrl(url, 'app') : Promise.resolve(false);
