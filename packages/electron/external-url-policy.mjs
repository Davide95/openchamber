const EXCLUDED_APP_SCHEMES = new Set([
  'tel', 'sms', 'callto', 'cid', 'xmpp', 'irc', 'ircs', 'news', 'snews', 'nntp', 'feed', 'webcal',
  'javascript', 'data', 'vbscript', 'blob', 'filesystem', 'about',
  'chrome', 'chrome-extension', 'devtools', 'moz-extension', 'ms-browser-extension', 'microsoft-edge',
  'file', 'ws', 'wss', 'ftp', 'ftps', 'gopher', 'tftp', 'intent', 'shell', 'search', 'search-ms',
  'hcp', 'help', 'cmd', 'powershell',
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

const CUSTOM_APP_SCHEME_RE = /^[a-z][a-z0-9+.-]{1,31}$/;
const EXPLICIT_HIERARCHICAL_HTTP_RE = /^https?:\/\/[^/?#\\]/i;
const EXPLICIT_HIERARCHICAL_CUSTOM_RE = /^[a-z][a-z0-9+.-]{1,31}:\/\/[^/?#\\]/i;
const ENCODED_CONTROL_BYTE_RE = /%([01][0-9a-f]|7f)/i;
const ENCODED_AUTHORITY_DELIMITER_RE = /%(?:2f|3f|23|5c|40)/i;
const ALLOWED_MAILTO_QUERY_KEYS = new Set(['to', 'cc', 'bcc', 'subject', 'body', 'in-reply-to', 'references']);

const hasControlCharacters = (value) => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
};

const hasNonWhitespaceControlCharacters = (value) => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
};

const hasUnsafeRawCharacters = (value) => /\s/.test(value) || value.includes('\\') || value.includes('"');

const isValidMailtoUrl = (trimmed, parsed) => {
  if (/^mailto:\/\//i.test(trimmed) || hasUnsafeRawCharacters(trimmed)) return false;
  if (!parsed.pathname.trim() && parsed.searchParams.size === 0) return false;
  if (ENCODED_CONTROL_BYTE_RE.test(parsed.pathname) || ENCODED_CONTROL_BYTE_RE.test(parsed.hash)) return false;
  for (const [key, value] of parsed.searchParams.entries()) {
    const normalizedKey = key.toLowerCase();
    if (!ALLOWED_MAILTO_QUERY_KEYS.has(normalizedKey)) return false;
    const badValue = normalizedKey === 'body'
      ? hasNonWhitespaceControlCharacters(value)
      : hasControlCharacters(value);
    if (badValue) return false;
  }
  const serialized = parsed.toString();
  return !hasControlCharacters(serialized) && !hasUnsafeRawCharacters(serialized);
};

export const parseAutoOpenableExternalUrl = (target) => {
  try {
    if (!target || hasControlCharacters(target)) return null;
    const trimmed = target.trim();
    if (!trimmed || !EXPLICIT_HIERARCHICAL_HTTP_RE.test(trimmed) || trimmed.includes('\\')) return null;
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const isAutoOpenableExternalUrl = (target) => parseAutoOpenableExternalUrl(target) !== null;

export const parseExternalUrl = (target) => {
  if (!target || hasControlCharacters(target)) {
    throw new Error('Invalid external URL');
  }
  const trimmed = target.trim();
  if (!trimmed) {
    throw new Error('Invalid external URL');
  }
  const parsed = new URL(trimmed);
  const scheme = parsed.protocol.slice(0, -1).toLowerCase();
  if (scheme === 'http' || scheme === 'https') {
    if (!EXPLICIT_HIERARCHICAL_HTTP_RE.test(trimmed) || trimmed.includes('\\') || !parsed.hostname) {
      throw new Error('Invalid external URL');
    }
    return parsed;
  }
  if (scheme === 'mailto') {
    if (!isValidMailtoUrl(trimmed, parsed)) {
      throw new Error('URL cannot be opened externally');
    }
    return parsed;
  }
  if (!CUSTOM_APP_SCHEME_RE.test(scheme) || scheme.startsWith('ms-') || EXCLUDED_APP_SCHEMES.has(scheme)) {
    throw new Error('URL scheme cannot be opened externally');
  }
  if (
    !EXPLICIT_HIERARCHICAL_CUSTOM_RE.test(trimmed)
    || hasUnsafeRawCharacters(trimmed)
    || ENCODED_CONTROL_BYTE_RE.test(trimmed)
    || !parsed.hostname
    || parsed.username
    || parsed.password
  ) {
    throw new Error('Invalid external URL');
  }
  const authority = trimmed.slice(scheme.length + 3).split(/[/?#]/, 1)[0];
  if (!authority || ENCODED_AUTHORITY_DELIMITER_RE.test(authority)) {
    throw new Error('Invalid external URL');
  }
  const serialized = parsed.toString();
  if (hasControlCharacters(serialized) || hasUnsafeRawCharacters(serialized)) {
    throw new Error('Invalid external URL');
  }
  return parsed;
};
