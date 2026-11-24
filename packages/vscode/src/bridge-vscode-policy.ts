import { z } from 'zod';
import { vscodeSettingsNavigationSchema, type VSCodeSettingsNavigation } from '../../ui/src/lib/settings/vscodeNavigation';

const sessionIdSchema = z.string().trim().min(1).max(512);
const sessionTitleSchema = z.string().transform((value) => value.slice(0, 4096));

type ShowSettingsArgs = [] | [VSCodeSettingsNavigation];
type OpenSessionInEditorArgs = [string] | [string, string];

const showSettingsArgsSchema = z.union([
  z.tuple([]),
  z.tuple([vscodeSettingsNavigationSchema.nullish()]),
]).transform((args): ShowSettingsArgs => (args.length === 0 || args[0] == null ? [] : [args[0]]));

const closeSettingsArgsSchema = z.tuple([]);

const setActiveSessionArgsSchema = z.union([
  z.tuple([]),
  z.tuple([sessionIdSchema.nullish()]),
  z.tuple([sessionIdSchema.nullish(), sessionTitleSchema.nullish()]),
]);

const openSessionInEditorArgsSchema = z.union([
  z.tuple([sessionIdSchema]),
  z.tuple([sessionIdSchema, sessionTitleSchema.nullish()]),
]).transform((args): OpenSessionInEditorArgs => (args[1] == null ? [args[0]] : [args[0], args[1]]));

export const commandEnvelopeSchema = z.object({
  command: z.string(),
});

export const allowedVSCodeCommandSchema = z.discriminatedUnion('command', [
  z.object({
    command: z.literal('openchamber.showSettings'),
    args: showSettingsArgsSchema.optional().default([]),
  }),
  z.object({
    command: z.literal('openchamber.closeSettings'),
    args: closeSettingsArgsSchema.optional().default([]),
  }),
  z.object({
    command: z.literal('openchamber.setActiveSession'),
    args: setActiveSessionArgsSchema.optional().default([]),
  }),
  z.object({
    command: z.literal('openchamber.openSessionInEditor'),
    args: openSessionInEditorArgsSchema,
  }),
]);

type AllowedVSCodeCommandName = z.infer<typeof allowedVSCodeCommandSchema>['command'];

const ALLOWED_VSCODE_COMMAND_NAMES = {
  'openchamber.showSettings': true,
  'openchamber.closeSettings': true,
  'openchamber.setActiveSession': true,
  'openchamber.openSessionInEditor': true,
} as const satisfies Record<AllowedVSCodeCommandName, true>;

export const ALLOWED_VSCODE_COMMANDS = new Set<string>(Object.keys(ALLOWED_VSCODE_COMMAND_NAMES));

export const settingsReadyCommandSchema = z.object({
  command: z.literal('openchamber.settingsReady'),
  args: z.tuple([]).optional(),
});

export const updateSessionEditorTitleCommandSchema = z.object({
  command: z.literal('openchamber.updateSessionEditorTitle'),
  args: z.union([
    z.tuple([sessionIdSchema]),
    z.tuple([sessionIdSchema, sessionTitleSchema.nullish()]),
  ]),
});

export const externalUrlPayloadSchema = z.object({
  url: z.string(),
});

const CUSTOM_APP_SCHEME_RE = /^[a-z][a-z0-9+.-]{1,31}$/;
const EXPLICIT_HIERARCHICAL_HTTP_RE = /^https?:\/\/[^/?#\\]/i;
const EXPLICIT_HIERARCHICAL_CUSTOM_RE = /^[a-z][a-z0-9+.-]{1,31}:\/\/[^/?#\\]/i;
const ENCODED_CONTROL_BYTE_RE = /%([01][0-9a-f]|7f)/i;
const ENCODED_NON_WHITESPACE_CONTROL_BYTE_RE = /%(?:0[0-8bcef]|1[0-9a-f]|7f)/i;
const ENCODED_AUTHORITY_DELIMITER_RE = /%(?:2f|3f|23|5c|40)/i;
const ALLOWED_MAILTO_QUERY_KEYS = new Set(['to', 'cc', 'bcc', 'subject', 'body', 'in-reply-to', 'references']);

const EXCLUDED_EXTERNAL_URL_SCHEMES = new Set([
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

const isValidMailtoUrl = (trimmed: string, parsed: URL): boolean => {
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

type AllowedExternalUrlResult =
  | { ok: true; url: string; scheme: string }
  | { ok: false; error: string };

export const parseAllowedExternalUrl = (rawUrl: string): AllowedExternalUrlResult => {
  if (hasControlCharacters(rawUrl)) {
    return { ok: false, error: 'Invalid URL' };
  }
  const target = rawUrl.trim();
  if (!target) {
    return { ok: false, error: 'URL is required' };
  }
  if (hasUnsafeRawCharacters(target)) {
    return { ok: false, error: 'Invalid URL' };
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  const scheme = parsed.protocol.slice(0, -1).toLowerCase();
  if (scheme === 'http' || scheme === 'https') {
    if (!EXPLICIT_HIERARCHICAL_HTTP_RE.test(target) || !parsed.hostname) {
      return { ok: false, error: 'Invalid URL' };
    }
    const authority = target.slice(scheme.length + 3).split(/[/?#]/, 1)[0];
    if (
      !authority
      || ENCODED_AUTHORITY_DELIMITER_RE.test(authority)
      || ENCODED_CONTROL_BYTE_RE.test(authority)
      || ENCODED_CONTROL_BYTE_RE.test(parsed.pathname)
      || ENCODED_CONTROL_BYTE_RE.test(parsed.hash)
      || ENCODED_NON_WHITESPACE_CONTROL_BYTE_RE.test(parsed.search)
    ) {
      return { ok: false, error: 'Invalid URL' };
    }
    return { ok: true, url: parsed.toString(), scheme };
  }
  if (scheme === 'mailto') {
    if (!isValidMailtoUrl(target, parsed)) {
      return { ok: false, error: 'Invalid URL' };
    }
    return { ok: true, url: parsed.toString(), scheme };
  }
  if (!CUSTOM_APP_SCHEME_RE.test(scheme) || scheme.startsWith('ms-') || EXCLUDED_EXTERNAL_URL_SCHEMES.has(scheme)) {
    return { ok: false, error: 'URL scheme cannot be opened externally' };
  }
  if (
    !EXPLICIT_HIERARCHICAL_CUSTOM_RE.test(target)
    || ENCODED_CONTROL_BYTE_RE.test(target)
    || !parsed.hostname
    || parsed.username
    || parsed.password
  ) {
    return { ok: false, error: 'Invalid URL' };
  }
  const authority = target.slice(scheme.length + 3).split(/[/?#]/, 1)[0];
  if (!authority || ENCODED_AUTHORITY_DELIMITER_RE.test(authority)) {
    return { ok: false, error: 'Invalid URL' };
  }
  const serialized = parsed.toString();
  if (hasControlCharacters(serialized) || hasUnsafeRawCharacters(serialized)) {
    return { ok: false, error: 'Invalid URL' };
  }
  return { ok: true, url: serialized, scheme };
};
