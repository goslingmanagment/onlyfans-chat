# @kernel/sdk (vendored)

GENERATED — do not edit. This is a self-contained compiled snapshot of the
kernel SDK (`packages/sdk` + its contracts runtime) produced by the core
repo's `scripts/vendor-sdk.mjs`. Regenerate from core to update:

```sh
# from the core repo root
node scripts/vendor-sdk.mjs <path-to-this-directory>
```

- Contract hash: `f311c920e3958267af5de55e03b0b7c18e3d014bc6f1d496fc63ad59e0c839fe`
- Core commit: `7045e3201abacb876ef687d6166c54cf9b3d3ee4`

The contract hash is exported at runtime as `KERNEL_CONTRACT_HASH`; drift CI
compares it against core@main (stage-20 §2). Distribution via git-tag installs
(DP 10) replaces this vendoring at the Stage 20 release step — the consuming
import surface (`@kernel/sdk`) stays identical.
