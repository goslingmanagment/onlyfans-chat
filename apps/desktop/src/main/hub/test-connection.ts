// Settings → Agency Hub → "Test connection": one authenticated GET against the
// hub's identity probe. `GET /api/v1/auth/me` is the cheapest chatter-key
// endpoint (pure principal lookup, no page aggregation) and doubles as a page
// list for the mapping section. Main-process only (SPEC §15.1).

import { z } from 'zod';
import { CgError } from '@chatgoose/shared/errors/index';

export const HUB_AUTH_ME_PATH = '/api/v1/auth/me';

const HUB_PROBE_TIMEOUT_MS = 10_000;

const authMeSchema = z.looseObject({
  authMethod: z.string(),
  user: z.looseObject({
    username: z.string(),
    role: z.string(),
    assignedPages: z.array(z.looseObject({ label: z.string() })),
  }),
});

export interface HubProbeResult {
  username: string;
  role: string;
  pages: number;
}

export type HubProbeFetch = (
  url: string,
  init: { method: 'GET'; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

/**
 * Resolves with the principal on success; throws CG-HUB-01 (auth) / CG-HUB-02
 * / CG-NET-02. `clientVersion` (Stage 4 / Proposal 4.1) stamps
 * `x-client-version` when supplied and non-blank — the fleet-adoption
 * release gate reads it off every hub request.
 */
export async function probeHubConnection(
  baseUrl: string,
  apiKey: string,
  fetchImpl: HubProbeFetch = fetch,
  clientVersion?: string,
): Promise<HubProbeResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}${HUB_AUTH_ME_PATH}`;
  const version = clientVersion?.trim();
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        ...(version !== undefined && version.length > 0 ? { 'x-client-version': version } : {}),
      },
      signal: AbortSignal.timeout(HUB_PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new CgError('CG-NET-02', { message: `Hub probe timed out: ${url}` });
    }
    throw new CgError('CG-HUB-02', { message: `Hub unreachable: ${url}` });
  }
  if (response.status === 401 || response.status === 403) {
    throw new CgError('CG-HUB-01', { detail: { status: response.status } });
  }
  if (!response.ok) {
    throw new CgError('CG-HUB-02', { detail: { status: response.status } });
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CgError('CG-HUB-02', { message: 'Hub returned a non-JSON body.' });
  }
  const parsed = authMeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new CgError('CG-HUB-02', { message: 'Hub /auth/me response had an unexpected shape.' });
  }
  return {
    username: parsed.data.user.username,
    role: parsed.data.user.role,
    pages: parsed.data.user.assignedPages.length,
  };
}
