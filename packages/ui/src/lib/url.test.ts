import { afterEach, describe, expect, test } from 'bun:test';

import { getUrlScheme, isAppLinkUrl, isExternalHttpUrl, isLoopbackHttpUrl, isMailtoUrl, extractLoopbackUrls, openConfirmedAppLinkUrl, openExternalUrl, openMailtoUrl } from '@/lib/url';

describe('confirmed desktop app links', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  afterEach(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  test('passes the complete editor URL to the native bridge', async () => {
    const opened: string[] = [];
    const browserOpened: string[] = [];
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      __OPENCHAMBER_DESKTOP__: { openExternal: async (url: string) => { opened.push(url); } },
      open: (url: string) => { browserOpened.push(url); },
    } });
    const url = 'vscode://file/C:/Project/src/PlayerData.luau:42:3';
    expect(await openConfirmedAppLinkUrl(url)).toBe(true);
    expect(opened).toEqual([url]);
    expect(browserOpened).toEqual([]);
    expect(await openConfirmedAppLinkUrl('javascript:alert(1)')).toBe(false);
    expect(opened).toEqual([url]);
  });

  test('does not open a browser window when the native app or mailto handler fails', async () => {
    const browserOpened: string[] = [];
    const clickedHrefs: string[] = [];
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      createElement: () => {
        const anchor = { href: '', click() { clickedHrefs.push(anchor.href); } };
        return anchor;
      },
    } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      __OPENCHAMBER_DESKTOP__: { openExternal: async () => { throw new Error('No protocol handler'); } },
      open: (url: string) => { browserOpened.push(url); },
    } });
    expect(await openConfirmedAppLinkUrl('cursor://file/Project/a.ts:12')).toBe(false);
    expect(await openMailtoUrl('mailto:user@example.test')).toBe(false);
    expect(browserOpened).toEqual([]);
    expect(clickedHrefs).toEqual([]);
    expect(await openExternalUrl('https://example.test/')).toBe(true);
    expect(browserOpened).toEqual(['https://example.test/']);
  });

  test('keeps openExternalUrl HTTP(S)-only and routes sanitized mailto via openMailtoUrl without window.open', async () => {
    const opened: string[] = [];
    const browserOpened: string[] = [];
    const clickedAnchors: Array<{ href: string; target: string }> = [];
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      createElement: () => {
        const anchor = {
          href: '',
          target: '',
          click() { clickedAnchors.push({ href: anchor.href, target: anchor.target }); },
        };
        return anchor;
      },
    } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      __OPENCHAMBER_DESKTOP__: { openExternal: async (url: string) => { opened.push(url); } },
      open: (url: string) => { browserOpened.push(url); },
    } });

    expect(isMailtoUrl('mailto:user@example.test?subject=Hi')).toBe(true);
    expect(isMailtoUrl('mailto:user@example.test?subject=Hi&body=Line%201%0ALine%202')).toBe(true);
    expect(isMailtoUrl('MAILTO:user@example.test')).toBe(true);
    expect(isMailtoUrl('https://example.test')).toBe(false);
    expect(isMailtoUrl('mailto:user@example.test?attach=/etc/passwd')).toBe(false);
    expect(isMailtoUrl('mailto:user@example.test?Attachment=C:/secret.txt')).toBe(false);
    expect(isMailtoUrl('mailto:user@example.test?%61ttach=/etc/passwd')).toBe(false);
    expect(isMailtoUrl('mailto:user@example.test?subject=Hi%0d%0aBcc:evil@example.test')).toBe(false);
    expect(isMailtoUrl('mailto:user@example.test" --arg=evil')).toBe(false);
    expect(isExternalHttpUrl('mailto:user@example.test')).toBe(false);
    expect(isExternalHttpUrl('https://example.test')).toBe(true);
    expect(isExternalHttpUrl('http:example.test')).toBe(false);
    expect(isExternalHttpUrl('https:\\\\example.test')).toBe(false);

    expect(await openExternalUrl('mailto:user@example.test?subject=Hi')).toBe(false);
    expect(await openMailtoUrl('mailto:user@example.test?attach=/etc/passwd')).toBe(false);
    expect(await openMailtoUrl('mailto:user@example.test?subject=Hi')).toBe(true);
    expect(opened).toEqual(['mailto:user@example.test?subject=Hi']);
    expect(browserOpened).toEqual([]);
    expect(await openExternalUrl('smb://files.example.test/share')).toBe(false);
    expect(await openExternalUrl('vscode://file/Project/a.ts:12')).toBe(false);

    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      open: (url: string) => { browserOpened.push(url); },
    } });
    expect(await openMailtoUrl('mailto:user@example.test')).toBe(true);
    expect(browserOpened).toEqual([]);
    expect(clickedAnchors).toEqual([{ href: 'mailto:user@example.test', target: '' }]);
  });

  test('keeps browser app-link handling when there is no desktop bridge', async () => {
    const browserOpened: string[] = [];
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      open: (url: string) => { browserOpened.push(url); },
    } });
    expect(await openConfirmedAppLinkUrl('vscode://file/Project/a.ts:12')).toBe(true);
    expect(browserOpened).toEqual(['vscode://file/Project/a.ts:12']);
  });
});

describe('getUrlScheme', () => {
  test('extracts the lowercased scheme', () => {
    expect(getUrlScheme('Obsidian://open?vault=X')).toBe('obsidian');
    expect(getUrlScheme('https://example.test')).toBe('https');
  });

  test('returns null for unparseable values', () => {
    expect(getUrlScheme('')).toBeNull();
    expect(getUrlScheme('not a url')).toBeNull();
  });
});

describe('isAppLinkUrl', () => {
  test('accepts custom application schemes', () => {
    expect(isAppLinkUrl('obsidian://open?vault=Notebook&file=a%20b')).toBe(true);
    expect(isAppLinkUrl('vscode://file/path/to/file.ts')).toBe(true);
    expect(isAppLinkUrl('linear://issue/ABC-1')).toBe(true);
    expect(isAppLinkUrl('notion://note/xyz')).toBe(true);
    expect(isAppLinkUrl('slack://channel?id=C123')).toBe(true);
  });

  test('rejects browser and communication schemes', () => {
    expect(isAppLinkUrl('https://example.test')).toBe(false);
    expect(isAppLinkUrl('http://example.test')).toBe(false);
    expect(isAppLinkUrl('mailto:user@example.test')).toBe(false);
    expect(isAppLinkUrl('tel:+1234567890')).toBe(false);
    expect(isAppLinkUrl('sms:+1234567890')).toBe(false);
    expect(isAppLinkUrl('ircs://irc.example.test/chan')).toBe(false);
    expect(isAppLinkUrl('snews://news.example.test')).toBe(false);
    expect(isAppLinkUrl('webcal://example.test/cal.ics')).toBe(false);
  });

  test('rejects dangerous, internal, and malformed schemes', () => {
    expect(isAppLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isAppLinkUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isAppLinkUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isAppLinkUrl('blob:https://example.test/uuid')).toBe(false);
    expect(isAppLinkUrl('about:blank')).toBe(false);
    expect(isAppLinkUrl('file:///etc/passwd')).toBe(false);
    expect(isAppLinkUrl('ws://localhost:8080')).toBe(false);
    expect(isAppLinkUrl('ftp://files.example.test')).toBe(false);
    expect(isAppLinkUrl('intent://scan/#Intent;scheme=zxing;end')).toBe(false);
    expect(isAppLinkUrl('chrome://settings')).toBe(false);
    expect(isAppLinkUrl('devtools://devtools/bundled/inspector.html')).toBe(false);
    expect(isAppLinkUrl('ms-msdt:/id%20PCWDiagnostic')).toBe(false);
    expect(isAppLinkUrl('search-ms:query=report')).toBe(false);
    expect(isAppLinkUrl('shell:AppsFolder')).toBe(false);
    for (const url of [
      'search:query=x&crumb=location:\\\\example.test\\share',
      'ms-appinstaller:?source=https://example.test/x.appx',
      'ms-cxh://x',
      'ms-cxh-full://x',
      'ms-settings:windowsdefender',
      'ms-quick-assist:',
      'ms-future-handler://x',
      'hcp://services/subsite',
      'help:topic',
      'cmd://run',
      'powershell://run',
      'microsoft-edge:https://example.test',
      'smb://files.example.test/share',
      'cifs://files.example.test/share',
      'afp://files.example.test/share',
      'afps://files.example.test/share',
      'nfs://files.example.test/export',
      'dav://files.example.test/share',
      'davs://files.example.test/share',
      'webdav://files.example.test/share',
      'webdavs://files.example.test/share',
      'ssh://user@example.test',
      'sftp://user@example.test/file',
      'svn+ssh://example.test/repo',
      'git+ssh://example.test/repo',
      'ssh+git://example.test/repo',
      'rdp://example.test',
      'vnc://example.test',
      'telnet://example.test',
      'rlogin://example.test',
      'rsh://example.test',
      'rexec://example.test',
      'gopher://example.test/',
      'tftp://example.test/x',
      'ldap://example.test/dc=example',
      'ldaps://example.test/dc=example',
      'ms-officecmd:ofe|u|https://example.test/doc.docx',
      'ms-word:ofe|u|https://example.test/doc.docx',
      'ms-excel:ofe|u|https://example.test/sheet.xlsx',
      'ms-powerpoint:ofe|u|https://example.test/deck.pptx',
      'ms-visio:ofe|u|https://example.test/chart.vsdx',
      'ms-project:ofe|u|https://example.test/plan.mpp',
      'ms-publisher:ofe|u|https://example.test/pub.pub',
      'ms-access:ofe|u|https://example.test/db.accdb',
      'ms-its:C:/Windows/Help/mui/0409/sample.chm::/topic.htm',
      'its:C:/sample.chm::/topic.htm',
      'mhtml:https://example.test/archive.mht',
      'mk:@MSITStore:C:/sample.chm::/topic.htm',
      'res://example.dll/page.html',
      'jar:https://example.test/app.jar!/index.html',
      'jnlp://example.test/app.jnlp',
      'view-source:https://example.test/',
      'applescript://com.apple.scripteditor?action=new',
      'shortcuts://run-shortcut?name=Demo',
      'x-man-page://ls',
      'x-apple.systempreferences:com.apple.preference.security',
      'itms-services://?action=download-manifest&url=https://example.test/a.plist',
      'command:workbench.action.terminal.new',
      'vscode-remote://ssh-remote+x/tmp',
      'vscode-file://vscode-app/etc/passwd',
      'vscode-webview://id/index.html',
      'vscode-resource://file/etc/passwd',
      'vscode-userdata:/User/settings.json',
      'openchamber-diff:/file?key=1',
      'ab:\\Windows\\System32\\calc.exe',
      'ab:\\\\attacker.test\\share\\payload.exe',
      'vscode:foo" --evil-flag',
      'obsidian://open?vault=x&file=a\\b',
      'custom://good.test%2f@evil.test/x',
      'custom:////evil.test/share',
      'obsidian://open?vault=x\r\ny',
      'obsidian://open?vault=x\u0000y',
    ]) {
      expect(isAppLinkUrl(url)).toBe(false);
    }
  });

  test('rejects OpenChamber and Capacitor self-deep-links', () => {
    expect(isAppLinkUrl('openchamber://connect?host=x')).toBe(false);
    expect(isAppLinkUrl('openchamber-ui://app/index.html')).toBe(false);
    expect(isAppLinkUrl('capacitor://localhost/index.html')).toBe(false);
  });

  test('rejects malformed input', () => {
    expect(isAppLinkUrl('')).toBe(false);
    expect(isAppLinkUrl('random text')).toBe(false);
  });
});


describe('isLoopbackHttpUrl', () => {
  test('recognizes IPv4 and localhost loopback hosts', () => {
    expect(isLoopbackHttpUrl('http://localhost:5173/')).toBe(true);
    expect(isLoopbackHttpUrl('http://127.0.0.1:5173/')).toBe(true);
    expect(isLoopbackHttpUrl('https://0.0.0.0:3000')).toBe(true);
    expect(isLoopbackHttpUrl('https://example.test')).toBe(false);
  });

  test('recognizes bracketed IPv6 loopback from WHATWG URL.hostname', () => {
    // new URL('http://[::1]:5173/').hostname === '[::1]'
    expect(isLoopbackHttpUrl('http://[::1]:5173/')).toBe(true);
    expect(isLoopbackHttpUrl('https://[::1]:4123/preview')).toBe(true);
  });
});

describe('extractLoopbackUrls', () => {
  test('keeps bracketed IPv6 loopback URLs after membership filtering', () => {
    expect(extractLoopbackUrls('open http://[::1]:5173/ and http://localhost:5173/')).toEqual([
      'http://[::1]:5173/',
      'http://localhost:5173/',
    ]);
  });
});
