import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { createOpenCodeTrust } from '../../web/server/lib/opencode-trust/index.js';
import { formatOpenCodeStatusProbes, runOpenCodeStatusProbes } from './opencodeStatusProbes';

let seenPaths: string[] = [];
let port = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  seenPaths.push(url.pathname);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: AddressInfo | string | null = server.address();
  port = address instanceof Object ? address.port : 0;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seenPaths = [];
});

describe('OpenCode status diagnostics probes', () => {
  test('skips directory-scoped probes for an untrusted folder and probes all endpoints once trusted', async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vscode-status-probes-trust-')));
    const repo = path.join(root, 'repo');
    await mkdir(repo, { recursive: true });
    await writeFile(path.join(repo, 'evil.js'), 'export default {}');
    await writeFile(path.join(repo, 'opencode.json'), JSON.stringify({ plugins: ['./evil.js'] }));
    const trust = createOpenCodeTrust({
      storePath: path.join(root, 'trust.json'),
      homeDirectory: path.join(root, 'home'),
    });

    try {
      const refusedProbes = await runOpenCodeStatusProbes({
        resolvedApiUrl: `http://127.0.0.1:${port}`,
        workingDirectory: repo,
        trust,
      });

      const locationScopedPaths = ['/api/config', '/api/provider', '/api/agent', '/api/command', '/api/location'];
      for (const blockedPath of locationScopedPaths) {
        assert.ok(!seenPaths.includes(blockedPath), `unexpected probe to ${blockedPath}`);
      }
      assert.deepEqual(seenPaths.sort(), ['/api/info', '/api/project', '/api/session', '/api/session/active']);

      const byLabel = new Map(refusedProbes.map((probe) => [probe.label, probe]));
      for (const label of ['config', 'providers', 'agents', 'commands', 'location']) {
        const probe = byLabel.get(label);
        assert.equal(probe?.result?.skipped, true);
        assert.equal(probe?.result?.ok, false);
        assert.equal(probe?.result?.status, 403);
        assert.equal(probe?.result?.summary, 'folder trust required');
      }
      for (const label of ['health', 'project', 'sessions', 'sessionStatus']) {
        assert.equal(byLabel.get(label)?.result?.ok, true);
        assert.equal(byLabel.get(label)?.result?.status, 200);
      }

      const formatted = formatOpenCodeStatusProbes(refusedProbes);
      assert.ok(formatted.includes('- config: skipped status=403 folder trust required'));
      assert.ok(formatted.includes('- location: skipped status=403 folder trust required'));

      seenPaths = [];
      const { assessment } = await trust.assess(repo, { fresh: true });
      await trust.trust(repo, assessment.fingerprint);

      const trustedProbes = await runOpenCodeStatusProbes({
        resolvedApiUrl: `http://127.0.0.1:${port}`,
        workingDirectory: repo,
        trust,
      });
      assert.equal(trustedProbes.length, 9);
      assert.ok(trustedProbes.every((probe) => probe.result?.ok === true && probe.result?.status === 200));
      assert.equal(seenPaths.length, 9);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
