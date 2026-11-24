import { z } from 'zod';
import { vscodeSettingsNavigationSchema, type VSCodeSettingsNavigation } from '../../ui/src/lib/settings/vscodeNavigation';

const sessionIdSchema = z.string().trim().min(1).max(512);
const sessionTitleSchema = z.string().max(4096);

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

export const ALLOWED_VSCODE_COMMANDS = new Set([
  'openchamber.showSettings',
  'openchamber.closeSettings',
  'openchamber.setActiveSession',
  'openchamber.openSessionInEditor',
]);

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

const EXCLUDED_EXTERNAL_URL_SCHEMES = new Set([
  'tel', 'sms', 'callto', 'cid', 'xmpp', 'irc', 'news', 'nntp', 'feed', 'webcal',
  'javascript', 'data', 'vbscript', 'blob', 'filesystem', 'about',
  'chrome', 'chrome-extension', 'devtools', 'moz-extension', 'ms-browser-extension',
  'file', 'ws', 'wss', 'ftp', 'ftps', 'intent', 'ms-msdt', 'search-ms', 'shell',
  'openchamber', 'openchamber-ui', 'capacitor',
  'smb', 'afp', 'nfs', 'dav', 'davs', 'ssh', 'sftp', 'rdp', 'vnc', 'telnet', 'rlogin', 'ldap', 'ldaps',
  'ms-officecmd', 'ms-word', 'ms-excel', 'ms-powerpoint', 'ms-visio', 'ms-project', 'ms-publisher', 'ms-access',
  'ms-its', 'its', 'mhtml', 'mk', 'res', 'jar', 'jnlp', 'view-source',
]);

const hasControlCharacters = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
};

type AllowedExternalUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export const parseAllowedExternalUrl = (rawUrl: string): AllowedExternalUrlResult => {
  const target = rawUrl.trim();
  if (!target) {
    return { ok: false, error: 'URL is required' };
  }
  if (hasControlCharacters(target)) {
    return { ok: false, error: 'Invalid URL' };
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  const scheme = parsed.protocol.slice(0, -1).toLowerCase();
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') {
    return { ok: true, url: parsed.toString() };
  }
  if (!CUSTOM_APP_SCHEME_RE.test(scheme) || EXCLUDED_EXTERNAL_URL_SCHEMES.has(scheme)) {
    return { ok: false, error: 'URL scheme cannot be opened externally' };
  }
  return { ok: true, url: parsed.toString() };
};
