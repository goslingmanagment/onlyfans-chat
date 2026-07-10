# @kernel/sdk (vendored)

GENERATED — do not edit. This is a self-contained compiled snapshot of the
kernel SDK (`packages/sdk` + its contracts runtime) produced by the core
repo's `scripts/vendor-sdk.mjs`. Regenerate from core to update:

```sh
# from the core repo root
node scripts/vendor-sdk.mjs <path-to-this-directory>
```

- Contract hash: `eda945c4270b1296dd1f6b7e9f6917b58049575d51fbacb0cb9e39c336221eea`
- Core commit: `2c500c1ece2570754000f7db7fe89dd0dc41deb7`

The contract hash is exported at runtime as `KERNEL_CONTRACT_HASH`; drift CI
compares it against core@main (stage-20 §2). Distribution via git-tag installs
(DP 10) replaces this vendoring at the Stage 20 release step — the consuming
import surface (`@kernel/sdk`) stays identical.
