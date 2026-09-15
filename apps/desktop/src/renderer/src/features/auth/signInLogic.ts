// Pure sign-in-screen decisions (tested in tests/renderer/sign-in-screen.test.ts):
// kept out of the component so vitest can prove them without a DOM.

import type { UserFacingError } from '@chatgoose/shared/errors/index';
import type { HubSignInResultVM } from '../../../../preload/contract';

export type SignInOutcome =
  | { kind: 'idle' }
  | { kind: 'signed-in' }
  /** The kernel answered and refused: a CG-HUB-2x the screen can localize. */
  | { kind: 'failed'; error: UserFacingError }
  /** The IPC call itself failed — main has no sign-in lane in this build. */
  | { kind: 'unavailable' };

/**
 * D35: sign-in answers with an outcome envelope, so a refusal is DATA, not a
 * rejected invoke. Only a transport-level failure (no hubAuth wiring at all)
 * reaches the mutation's error state.
 */
export function signInOutcome(input: {
  data: HubSignInResultVM | undefined;
  isError: boolean;
}): SignInOutcome {
  if (input.isError) return { kind: 'unavailable' };
  if (input.data === undefined) return { kind: 'idle' };
  return input.data.ok ? { kind: 'signed-in' } : { kind: 'failed', error: input.data.error };
}
