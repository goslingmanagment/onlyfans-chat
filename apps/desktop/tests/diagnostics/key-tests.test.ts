import { describe, expect, it } from 'vitest';
import { CgError } from '@chatgoose/shared/errors/index';
import { runKeyTest, type KeyTestDeps } from '../../src/main/diagnostics/key-tests';
import type { ProbeFetch } from '../../src/main/ai/providers/key-probe';
import type { SettingsStore } from '../../src/main/settings/store';
import { makeSettingsVM } from '../hub/helpers';

function deps(overrides: Partial<KeyTestDeps> & { secrets?: Record<string, string> } = {}): KeyTestDeps {
  const secrets = overrides.secrets ?? {};
  const vm = makeSettingsVM({ hubBaseUrl: 'https://hub.example.com' });
  const settingsStore: SettingsStore = {
    get: () => Promise.resolve(vm),
    update: () => Promise.resolve(vm),
  };
  return {
    keychain: { getSecret: (name) => Promise.resolve(secrets[name] ?? null) },
    settingsStore,
    ...(overrides.fetchImpl !== undefined ? { fetchImpl: overrides.fetchImpl } : {}),
    ...(overrides.ofapiProbe !== undefined ? { ofapiProbe: overrides.ofapiProbe } : {}),
  };
}

const okFetch: ProbeFetch = () => Promise.resolve(new Response('{}', { status: 200 }));
const unauthorizedFetch: ProbeFetch = () =>
  Promise.resolve(
    new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'nope' } }), {
      status: 401,
    }),
  );

describe('runKeyTest', () => {
  it('reports NOT_CONFIGURED when no key is stored', async () => {
    const result = await runKeyTest('anthropic', deps());
    expect(result).toEqual({ ok: false, code: 'NOT_CONFIGURED', message: 'No key saved yet.' });
  });

  it('anthropic: ok on 200, CG-AUTH-02 with provider wording on 401', async () => {
    const ok = await runKeyTest('anthropic', deps({ secrets: { anthropicKey: 'k' }, fetchImpl: okFetch }));
    expect(ok).toEqual({ ok: true, code: null, message: '' });

    const bad = await runKeyTest(
      'anthropic',
      deps({ secrets: { anthropicKey: 'k' }, fetchImpl: unauthorizedFetch }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('CG-AUTH-02');
    expect(bad.message).toBe('Claude API key is invalid.');
  });

  it('openrouter: provider wording on 401', async () => {
    const bad = await runKeyTest(
      'openrouter',
      deps({ secrets: { openRouterKey: 'k' }, fetchImpl: unauthorizedFetch }),
    );
    expect(bad.code).toBe('CG-AUTH-02');
    expect(bad.message).toBe('OpenRouter API key is invalid.');
  });

  it('ofapi: returns the team name on success and CG-OF-01 on a rejected key', async () => {
    const ok = await runKeyTest(
      'ofapi',
      deps({
        secrets: { ofapiKey: 'of-k' },
        ofapiProbe: () => Promise.resolve({ team: { name: 'Goose Team', slug: 'goose' }, api_key: null }),
      }),
    );
    expect(ok).toEqual({ ok: true, code: null, message: '', team: 'Goose Team' });

    const bad = await runKeyTest(
      'ofapi',
      deps({
        secrets: { ofapiKey: 'of-k' },
        ofapiProbe: () => Promise.reject(new CgError('CG-OF-01')),
      }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('CG-OF-01');
  });

  it('hub: returns the principal on success, HUB_NOT_CONFIGURED without a key', async () => {
    const body = JSON.stringify({
      authMethod: 'api_key',
      user: { id: 1, username: 'dasha', role: 'chatter', assignedPages: [{ label: 'loravie' }] },
    });
    const ok = await runKeyTest(
      'hub',
      deps({
        secrets: { hubApiKey: 'agency_hub_core_k' },
        fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
      }),
    );
    expect(ok).toEqual({
      ok: true,
      code: null,
      message: '',
      username: 'dasha',
      role: 'chatter',
      pages: 1,
    });

    const missing = await runKeyTest('hub', deps());
    expect(missing.code).toBe('HUB_NOT_CONFIGURED');
  });
});
