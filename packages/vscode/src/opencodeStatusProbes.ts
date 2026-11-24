import { openCodeTrust, type OpenCodeTrustGuard } from './opencodeTrust';

interface OpenCodeStatusProbeResult {
  ok: boolean;
  status: number;
  elapsedMs: number;
  summary: string;
  skipped?: boolean;
}

interface OpenCodeStatusProbe {
  label: string;
  url: string;
  result: OpenCodeStatusProbeResult | null;
}

interface OpenCodeStatusProbeTarget {
  label: string;
  path: string;
  includeDirectory?: boolean;
  timeoutMs?: number;
}

const PROBE_TARGETS: ReadonlyArray<OpenCodeStatusProbeTarget> = [
  { label: 'health', path: '/api/info', includeDirectory: false },
  { label: 'config', path: '/api/config', includeDirectory: true },
  { label: 'providers', path: '/api/provider', includeDirectory: true },
  { label: 'agents', path: '/api/agent', includeDirectory: true, timeoutMs: 12000 },
  { label: 'commands', path: '/api/command', includeDirectory: true, timeoutMs: 10000 },
  { label: 'project', path: '/api/project', includeDirectory: false },
  { label: 'location', path: '/api/location', includeDirectory: true },
  { label: 'sessions', path: '/api/session', includeDirectory: true, timeoutMs: 12000 },
  { label: 'sessionStatus', path: '/api/session/active', includeDirectory: false },
];

const buildProbeUrl = (resolvedApiUrl: string, pathname: string, workingDirectory: string, includeDirectory: boolean): URL => {
  const base = `${resolvedApiUrl.replace(/\/+$/, '')}/`;
  const url = new URL(pathname.replace(/^\/+/, ''), base);
  if (includeDirectory && workingDirectory) {
    url.searchParams.set('directory', workingDirectory);
  }
  return url;
};

const safeFetchProbe = async (
  fetchImpl: typeof fetch,
  input: string,
  headers: Record<string, string>,
  timeoutMs = 6000,
): Promise<OpenCodeStatusProbeResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const resp = await fetchImpl(input, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;
    const contentType = resp.headers.get('content-type') || '';
    const isJson = contentType.toLowerCase().includes('json') && !contentType.toLowerCase().includes('text/html');

    let summary = '';
    if (isJson) {
      const json = await resp.json().catch(() => null);
      if (Array.isArray(json)) {
        summary = `json[array] len=${json.length}`;
      } else if (json && typeof json === 'object') {
        const keys = Object.keys(json).slice(0, 8);
        summary = `json[object] keys=${keys.join(',')}${Object.keys(json).length > keys.length ? ',…' : ''}`;
      } else {
        summary = `json[${typeof json}]`;
      }
    } else {
      summary = contentType ? `content-type=${contentType}` : 'no content-type';
    }

    return { ok: resp.ok && isJson, status: resp.status, elapsedMs, summary };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const isAbort =
      controller.signal.aborted
      || (error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted')));
    const message = isAbort
      ? `timeout after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : String(error);
    return { ok: false, status: 0, elapsedMs, summary: `error=${message}` };
  } finally {
    clearTimeout(timeout);
  }
};

export const runOpenCodeStatusProbes = async ({
  resolvedApiUrl,
  workingDirectory,
  authHeaders = {},
  trust = openCodeTrust,
  fetchImpl = fetch,
}: {
  resolvedApiUrl: string | null | undefined;
  workingDirectory: string;
  authHeaders?: Record<string, string>;
  trust?: OpenCodeTrustGuard;
  fetchImpl?: typeof fetch;
}): Promise<OpenCodeStatusProbe[]> => {
  if (!resolvedApiUrl) return [];
  const headers = { Accept: 'application/json', ...authHeaders };
  return Promise.all(
    PROBE_TARGETS.map(async (entry) => {
      const url = buildProbeUrl(resolvedApiUrl, entry.path, workingDirectory, entry.includeDirectory !== false);
      const refusal = await trust.refusalFor({
        method: 'GET',
        path: `${entry.path}${url.search}`,
        headers,
      });
      if (refusal) {
        return {
          label: entry.label,
          url: url.toString(),
          result: {
            ok: false,
            status: refusal.status,
            elapsedMs: 0,
            summary: 'folder trust required',
            skipped: true,
          },
        };
      }
      const result = await safeFetchProbe(fetchImpl, url.toString(), headers, entry.timeoutMs ?? 6000);
      return { label: entry.label, url: url.toString(), result };
    }),
  );
};

export const formatOpenCodeStatusProbes = (probes: ReadonlyArray<OpenCodeStatusProbe>): string[] => {
  if (probes.length === 0) return [];
  return [
    'OpenCode API probes:',
    ...probes.map((probe) => {
      if (!probe.result) return `- ${probe.label}: (no url)`;
      const { ok, status, elapsedMs, summary, skipped } = probe.result;
      if (skipped) return `- ${probe.label}: skipped status=${status} ${summary}`;
      const suffix = ok ? '' : ` url=${probe.url}`;
      return `- ${probe.label}: ${ok ? 'ok' : 'fail'} status=${status} time=${elapsedMs}ms ${summary}${suffix}`;
    }),
  ];
};
