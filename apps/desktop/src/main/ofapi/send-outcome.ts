// Send-outcome classification (SPEC §7.4–7.5). The outbox engine may mark a row
// 'failed' (retry/edit UI) ONLY on a 'definite' failure; everything else is
// 'indeterminate' — the message may have reached the fan, so it must NEVER be
// auto-retried (SPEC §15.5); the background verifier owns recovery.
// When in doubt: indeterminate.

import { CgError } from '@chatgoose/shared';
import { OfApiError } from './errors';

export type SendFailureKind = 'definite' | 'indeterminate';

// Connection-establishment failures: the request provably never left this
// machine (DNS, connect refused/unreachable).
const CONNECT_FAILURE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

// TLS/cert handshake rejections (Node/OpenSSL codes): no application bytes sent.
const TLS_FAILURE_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'CERT_SIGNATURE_FAILURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'HOSTNAME_MISMATCH',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function isConnectionEstablishmentCode(code: string): boolean {
  return (
    CONNECT_FAILURE_CODES.has(code) || TLS_FAILURE_CODES.has(code) || code.startsWith('ERR_TLS_')
  );
}

function errorCode(node: Error): string | undefined {
  if ('code' in node && typeof node.code === 'string') return node.code;
  return undefined;
}

/**
 * HTTP application status when the server definitively responded. For wrapped
 * ONLYFANS_COM_ERROR failures, OnlyFans' own status is the truth — the OFAPI
 * wrapper status is just packaging (a wrapped OF 5xx must stay indeterminate).
 */
function httpStatusOf(error: unknown): number | undefined {
  if (error instanceof OfApiError && error.upstreamStatus !== undefined) {
    return error.upstreamStatus;
  }
  if (error instanceof CgError && typeof error.detail?.status === 'number') {
    return error.detail.status;
  }
  return undefined;
}

/** Walks the .cause chain (bounded) for a connection-establishment failure code. */
function requestNeverLeft(error: unknown): boolean {
  let node: unknown = error;
  for (let depth = 0; depth < 10 && node instanceof Error; depth += 1) {
    const code = errorCode(node);
    if (code !== undefined && isConnectionEstablishmentCode(code)) return true;
    node = node.cause;
  }
  return false;
}

/**
 * SPEC §7.4–7.5, strictly. 'definite' (safe to mark failed + offer retry) ONLY when:
 * (a) the request provably never left (connection-establishment/TLS failure), or
 * (b) a definitive HTTP application response: 4xx except 408 (a 408 means the
 *     request reached the server; handling unknown), with 429 definite — a
 *     rate-limit rejection was not processed.
 * EVERYTHING else — timeout/abort, ECONNRESET/socket hang up, 5xx (incl. wrapped
 * OnlyFans 5xx), unknown errors — is 'indeterminate'.
 */
export function classifySendFailure(error: unknown): SendFailureKind {
  const status = httpStatusOf(error);
  if (status !== undefined) {
    if (status === 408) return 'indeterminate';
    if (status >= 400 && status < 500) return 'definite';
    return 'indeterminate';
  }
  if (requestNeverLeft(error)) return 'definite';
  return 'indeterminate';
}
