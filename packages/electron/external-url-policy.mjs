const EXCLUDED_APP_SCHEMES = new Set([
  'tel', 'sms', 'callto', 'cid', 'xmpp', 'irc', 'news', 'nntp', 'feed', 'webcal',
  'javascript', 'data', 'vbscript', 'blob', 'filesystem', 'about',
  'chrome', 'chrome-extension', 'devtools', 'moz-extension', 'ms-browser-extension',
  'file', 'ws', 'wss', 'ftp', 'ftps', 'intent', 'ms-msdt', 'search-ms', 'shell',
  'smb', 'afp', 'nfs', 'dav', 'davs', 'ssh', 'sftp', 'rdp', 'vnc', 'telnet', 'rlogin', 'ldap', 'ldaps',
  'ms-officecmd', 'ms-word', 'ms-excel', 'ms-powerpoint', 'ms-visio', 'ms-project', 'ms-publisher', 'ms-access',
  'ms-its', 'its', 'mhtml', 'mk', 'res', 'jar', 'jnlp', 'view-source',
  'openchamber', 'openchamber-ui', 'capacitor',
]);

export const isAutoOpenableExternalUrl = (target) => {
  try {
    const { protocol } = new URL(target);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const parseExternalUrl = (target) => {
  const parsed = new URL(target);
  const scheme = parsed.protocol.slice(0, -1);
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') return parsed;
  if (!/^[a-z][a-z0-9+.-]{1,31}$/.test(scheme) || EXCLUDED_APP_SCHEMES.has(scheme)) {
    throw new Error('URL scheme cannot be opened externally');
  }
  return parsed;
};
