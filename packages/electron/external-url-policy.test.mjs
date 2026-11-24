import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAutoOpenableExternalUrl, parseExternalUrl } from './external-url-policy.mjs';

test('preserves editor file paths, mailto links, lines and columns for the OS handler', () => {
  for (const url of [
    'vscode://file/Users/person/Project/package.json:7',
    'vscode://file/C:/Project/src/PlayerData.luau:42:3',
    'cursor://file/C:/Project/src/a%20b.ts:12',
    'obsidian://open?vault=Notebook&file=a%20b',
    'https://example.test/path',
    'http://localhost:3901/',
    'mailto:user@example.test',
    'mailto:user@example.test?subject=Hello%20World',
  ]) {
    assert.equal(parseExternalUrl(url).toString(), url);
  }
  assert.equal(parseExternalUrl('VSCODE://file/C:/Project/a.ts:1').protocol, 'vscode:');
  assert.equal(parseExternalUrl('MAILTO:user@example.test').protocol, 'mailto:');
});

test('rejects dangerous, internal and non-app protocols at the native boundary', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,test', 'vbscript:msgbox(1)',
    'blob:https://example.test/id', 'filesystem:https://example.test/file', 'about:blank',
    'chrome://settings', 'chrome-extension://id/page', 'devtools://page',
    'moz-extension://id/page', 'ms-browser-extension://id/page', 'file:///etc/passwd',
    'ws://localhost', 'wss://example.test', 'ftp://example.test', 'ftps://example.test',
    'intent://scan/', 'ms-msdt:/id%20PCWDiagnostic', 'search-ms:query=report', 'shell:AppsFolder',
    'smb://files.example.test/share', 'afp://files.example.test/share', 'nfs://files.example.test/export',
    'dav://files.example.test/share', 'davs://files.example.test/share',
    'ssh://user@example.test', 'sftp://user@example.test/file',
    'rdp://example.test', 'vnc://example.test', 'telnet://example.test', 'rlogin://example.test',
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
    'openchamber://connect?host=x', 'openchamber-ui://app/index.html', 'capacitor://localhost',
    'tel:+123', 'sms:+123', 'callto:+123', 'cid:id',
    'xmpp:user@example.test', 'irc://example.test', 'news:group', 'nntp://example.test',
    'feed:https://example.test', 'webcal://example.test/calendar', '', 'not a url', 'a://file',
  ]) {
    assert.throws(() => parseExternalUrl(url), undefined, url);
  }
});

test('allows only http and https for automatic navigation and popup fallbacks', () => {
  for (const url of [
    'https://example.test/path?x=1',
    'http://example.test/',
    'HTTPS://EXAMPLE.TEST/UPPER',
  ]) {
    assert.equal(isAutoOpenableExternalUrl(url), true, url);
  }
  for (const url of [
    'mailto:user@example.test',
    'vscode://file/Users/person/Project/package.json:7',
    'ms-msdt:/id%20PCWDiagnostic',
    'search-ms:query=report',
    'file:///etc/passwd',
    'smb://files.example.test/share',
    'ssh://user@example.test',
    'ms-officecmd:ofe|u|https://example.test/doc.docx',
    'javascript:alert(1)',
    'evil-test://payload',
    'openchamber://connect?host=x',
    '',
    'not a url',
  ]) {
    assert.equal(isAutoOpenableExternalUrl(url), false, url);
  }
});
