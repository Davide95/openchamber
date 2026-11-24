import assert from 'node:assert/strict';
import test from 'node:test';
import { attachWindowNavigationGuards } from './window-navigation-guards.mjs';

const createHarness = ({ allowConfiguredHostNavigation = true, currentUrl = 'http://127.0.0.1:5173/' } = {}) => {
  const listeners = new Map();
  let windowOpenHandler = null;
  const externalOpened = [];
  const hostOpened = [];
  const sessionOpened = [];
  const warnings = [];
  const mainFrame = { url: currentUrl };

  const webContents = {
    mainFrame,
    getURL: () => currentUrl,
    setWindowOpenHandler: (handler) => {
      windowOpenHandler = handler;
    },
    on: (event, handler) => {
      listeners.set(event, handler);
    },
  };

  const remoteHost = { id: 'host-remote', url: 'https://remote.example.test' };

  attachWindowNavigationGuards({
    webContents,
    uiProtocol: 'openchamber-ui',
    getAllowedOrigins: () => ['http://127.0.0.1:5173', 'http://127.0.0.1:3901'],
    findConfiguredHostForUrl: (raw) => {
      try {
        return new URL(raw).origin === 'https://remote.example.test' ? remoteHost : null;
      } catch {
        return null;
      }
    },
    sessionRouteFromUrl: (raw) => {
      try {
        const session = new URL(raw).searchParams.get('session');
        return session ? { sessionId: session } : null;
      } catch {
        return null;
      }
    },
    openHostWindow: async (host, route, opts) => {
      hostOpened.push({ host, route, opts });
    },
    onOpenSession: (route) => {
      sessionOpened.push(route);
    },
    openExternal: async (url) => {
      externalOpened.push(url);
    },
    log: { warn: (...args) => warnings.push(args.join(' ')) },
    allowConfiguredHostNavigation,
  });

  const triggerWillNavigate = (url) => {
    let prevented = false;
    listeners.get('will-navigate')({ preventDefault: () => { prevented = true; } }, url);
    return prevented;
  };

  const triggerWillFrameNavigate = (details) => {
    let prevented = false;
    listeners.get('will-frame-navigate')({ ...details, preventDefault: () => { prevented = true; } });
    return prevented;
  };

  return {
    mainFrame,
    externalOpened,
    hostOpened,
    sessionOpened,
    warnings,
    triggerWindowOpen: (url) => windowOpenHandler({ url }),
    triggerWillNavigate,
    triggerWillFrameNavigate,
  };
};

const BLOCKED_AUTO_OPEN_URLS = [
  'ms-msdt:/id%20PCWDiagnostic',
  'search-ms:query=report',
  'file:///etc/passwd',
  'smb://files.example.test/share',
  'ssh://user@example.test',
  'ms-officecmd:ofe|u|https://example.test/doc.docx',
  'javascript:alert(1)',
  'mailto:user@example.test',
  'vscode://file/Users/person/Project/package.json:7',
  'evil-test://payload',
];

for (const [label, allowConfiguredHostNavigation] of [['main window', true], ['mini chat window', false]]) {
  test(`${label} opens only http and https on automatic popup and navigation fallbacks`, () => {
    const harness = createHarness({ allowConfiguredHostNavigation });

    for (const url of BLOCKED_AUTO_OPEN_URLS) {
      assert.deepEqual(harness.triggerWindowOpen(url), { action: 'deny' }, `popup ${url}`);
      assert.equal(harness.triggerWillNavigate(url), true, `navigate ${url}`);
    }
    assert.deepEqual(harness.externalOpened, []);

    assert.deepEqual(harness.triggerWindowOpen('https://docs.example.test/guide'), { action: 'deny' });
    assert.equal(harness.triggerWillNavigate('http://external.example.test/page'), true);
    assert.deepEqual(harness.externalOpened, [
      'https://docs.example.test/guide',
      'http://external.example.test/page',
    ]);
  });

  test(`${label} allows local app origins and blocks untrusted opaque guest frames`, () => {
    const harness = createHarness({ allowConfiguredHostNavigation });

    assert.equal(harness.triggerWillNavigate('http://127.0.0.1:5173/mini-chat.html'), false);
    assert.equal(harness.triggerWillNavigate('http://127.0.0.1:3901/index.html'), false);
    assert.equal(harness.triggerWillNavigate('openchamber-ui://app/index.html'), false);
    assert.equal(harness.triggerWillNavigate('devtools://devtools/bundled/inspector.html'), false);

    assert.deepEqual(harness.triggerWindowOpen('http://127.0.0.1:5173/?session=ses_123'), { action: 'deny' });
    assert.deepEqual(harness.sessionOpened, [{ sessionId: 'ses_123' }]);

    assert.equal(
      harness.triggerWillFrameNavigate({
        isMainFrame: false,
        frame: { origin: 'null', url: 'http://127.0.0.1:3901/api/guests/demo/index.html', parent: harness.mainFrame },
        initiator: null,
        url: 'https://evil.example.test/?leak=1',
      }),
      true,
    );
    assert.equal(
      harness.triggerWillFrameNavigate({
        isMainFrame: false,
        frame: { origin: 'null', url: '', parent: harness.mainFrame },
        initiator: harness.mainFrame,
        url: 'https://remote.example.test/api/guests/demo/index.html',
      }),
      false,
    );
  });
}

test('main window navigates configured hosts while mini chat routes them to openHostWindow', () => {
  const mainHarness = createHarness({ allowConfiguredHostNavigation: true });
  assert.equal(mainHarness.triggerWillNavigate('https://remote.example.test/?session=ses_remote'), false);
  assert.deepEqual(mainHarness.hostOpened, []);

  assert.deepEqual(mainHarness.triggerWindowOpen('https://remote.example.test/?session=ses_popup'), { action: 'deny' });
  assert.equal(mainHarness.hostOpened.length, 1);
  assert.deepEqual(mainHarness.hostOpened[0].route, { sessionId: 'ses_popup' });

  const miniHarness = createHarness({ allowConfiguredHostNavigation: false });
  assert.equal(miniHarness.triggerWillNavigate('https://remote.example.test/?session=ses_mini'), true);
  assert.equal(miniHarness.hostOpened.length, 1);
  assert.deepEqual(miniHarness.hostOpened[0].route, { sessionId: 'ses_mini' });
  assert.deepEqual(miniHarness.externalOpened, []);
});
