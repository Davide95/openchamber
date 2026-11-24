import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAutoOpenableExternalUrl, parseAutoOpenableExternalUrl, parseExternalUrl } from './external-url-policy.mjs';

test('preserves editor file paths, safe mailto links, lines and columns for the OS handler', () => {
  for (const url of [
    'vscode://file/Users/person/Project/package.json:7',
    'vscode://file/C:/Project/src/PlayerData.luau:42:3',
    'cursor://file/C:/Project/src/a%20b.ts:12',
    'obsidian://open?vault=Notebook&file=a%20b',
    'https://example.test/path',
    'http://localhost:3901/',
    'mailto:user@example.test',
    'mailto:user@example.test?subject=Hello%20World',
    'mailto:user@example.test?subject=Hi&body=Line%201%0ALine%202',
  ]) {
    assert.equal(parseExternalUrl(url).toString(), url);
  }
  assert.equal(parseExternalUrl('VSCODE://file/C:/Project/a.ts:1').protocol, 'vscode:');
  assert.equal(parseExternalUrl('MAILTO:user@example.test').protocol, 'mailto:');
});

test('rejects dangerous, internal, malformed and non-app protocols at the native boundary', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,test', 'vbscript:msgbox(1)',
    'blob:https://example.test/id', 'filesystem:https://example.test/file', 'about:blank',
    'chrome://settings', 'chrome-extension://id/page', 'devtools://page',
    'moz-extension://id/page', 'ms-browser-extension://id/page', 'microsoft-edge:https://example.test', 'file:///etc/passwd',
    'ws://localhost', 'wss://example.test', 'ftp://example.test', 'ftps://example.test', 'gopher://example.test/', 'tftp://example.test/x',
    'intent://scan/', 'ms-msdt:/id%20PCWDiagnostic', 'ms-appinstaller:?source=https://example.test/x.appx',
    'ms-cxh://x', 'ms-cxh-full://x', 'ms-settings:windowsdefender', 'ms-quick-assist:', 'ms-future-handler://x',
    'search-ms:query=report', 'search:query=x&crumb=location:\\\\example.test\\share', 'shell:AppsFolder',
    'hcp://services/subsite', 'help:topic', 'cmd://run', 'powershell://run',
    'smb://files.example.test/share', 'cifs://files.example.test/share',
    'afp://files.example.test/share', 'afps://files.example.test/share', 'nfs://files.example.test/export',
    'dav://files.example.test/share', 'davs://files.example.test/share', 'webdav://files.example.test/share', 'webdavs://files.example.test/share',
    'ssh://user@example.test', 'sftp://user@example.test/file', 'svn+ssh://example.test/repo', 'git+ssh://example.test/repo', 'ssh+git://example.test/repo',
    'rdp://example.test', 'vnc://example.test', 'telnet://example.test', 'rlogin://example.test', 'rsh://example.test', 'rexec://example.test',
    'ldap://example.test/dc=example', 'ldaps://example.test/dc=example',
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
    'openchamber://connect?host=x', 'openchamber-ui://app/index.html', 'openchamber-diff:/file?key=1', 'capacitor://localhost',
    'command:workbench.action.terminal.new', 'vscode-remote://ssh-remote+x/tmp', 'vscode-file://vscode-app/etc/passwd',
    'vscode-webview://id/index.html', 'vscode-resource://file/etc/passwd', 'vscode-userdata:/User/settings.json',
    'tel:+123', 'sms:+123', 'callto:+123', 'cid:id',
    'xmpp:user@example.test', 'irc://example.test', 'ircs://example.test/chan', 'news:group', 'snews://example.test', 'nntp://example.test',
    'feed:https://example.test', 'webcal://example.test/calendar',
    'ab:\\Windows\\System32\\calc.exe',
    'ab:\\\\attacker.test\\share\\payload.exe',
    'vscode:foo" --evil-flag',
    'obsidian://open?vault=x&file=a\\b',
    'obsidian://open?vault=x&file=a"b',
    'custom://good.test%2f@evil.test/x',
    'custom:////evil.test/share',
    'custom:///%2f/evil.test/share',
    'obsidian://open?vault=x%00y',
    'https://example.test/path\r\n',
    'https://example.test/path\u0000',
    '\thttps://example.test/',
    'https:\\\\example.test/path',
    'http:example.test',
    'http:///etc/passwd',
    'mailto:',
    'mailto://user@example.test',
    'mailto:user@example.test?attach=/etc/passwd',
    'mailto:user@example.test?Attachment=C:/secret.txt',
    'mailto:user@example.test?%61ttach=/etc/passwd',
    'mailto:user@example.test?x-custom=1',
    'mailto:user@example.test?subject=Hi%0d%0aBcc:evil@example.test',
    'mailto:user@example.test?body=ok%00bad',
    'mailto:user@example.test" --arg=evil',
    '', 'not a url', 'a://file',
  ]) {
    assert.throws(() => parseExternalUrl(url), undefined, url);
  }
});

test('allows only normalized http and https for automatic navigation and popup fallbacks', () => {
  for (const [url, expected] of [
    ['https://example.test/path?x=1', 'https://example.test/path?x=1'],
    ['http://example.test/', 'http://example.test/'],
    ['HTTPS://EXAMPLE.TEST/UPPER', 'https://example.test/UPPER'],
    [' https://example.test/trimmed ', 'https://example.test/trimmed'],
  ]) {
    assert.equal(isAutoOpenableExternalUrl(url), true, url);
    assert.equal(parseAutoOpenableExternalUrl(url)?.toString(), expected, url);
  }
  for (const url of [
    'mailto:user@example.test',
    'vscode://file/Users/person/Project/package.json:7',
    'ms-msdt:/id%20PCWDiagnostic',
    'search-ms:query=report',
    'search:query=report',
    'file:///etc/passwd',
    'smb://files.example.test/share',
    'ssh://user@example.test',
    'ms-officecmd:ofe|u|https://example.test/doc.docx',
    'javascript:alert(1)',
    'evil-test://payload',
    'openchamber://connect?host=x',
    'https://example.test/a\r\nb',
    'https://example.test/a\u0000b',
    'https:\\\\example.test/',
    'http:example.test',
    'http:///etc/passwd',
    '',
    'not a url',
  ]) {
    assert.equal(isAutoOpenableExternalUrl(url), false, url);
    assert.equal(parseAutoOpenableExternalUrl(url), null, url);
  }
});
