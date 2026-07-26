# VinQut/Pilot Runtime License Disposition

Status: owner-authorized distribution decision
Date: 2026-07-25

## Exact scope

This disposition applies only to:

- the VinQut wrapper at
  `373dfb960860c3ac259f56169ddabc06d2847eca`;
- the Pilot-derived inputs proven by
  `scripts/workbench-runtime-provenance.ts`;
- the official SysML v2 Pilot checkout at
  `fa709f28dfd49dfdb7ee83e4e19da2f57e0eb3aa`; and
- the locked semantic artifact SHA-256
  `8dc941e0e83fbdd063ee2e9148840fa2d5b80ad72f27d22c8267e61db52a5160`.

## Decision

The exact pinned Pilot checkout's root `LICENSE` is the authority for the
Pilot-derived content in this distribution. It declares the Eclipse Public
License 2.0. The upstream VinQut NOTICE labels the Pilot
`LGPL-3.0-or-later`; that label is inconsistent with the exact source pin and
is not used as the Pilot license conclusion for this distribution.

The distribution therefore:

1. preserves the original VinQut NOTICE unmodified as provenance;
2. includes the VinQut MIT license;
3. includes the exact pinned Pilot EPL-2.0 license;
4. includes the Workbench `NOTICE`, which records the correction and exact
   pins; and
5. rejects a semantic artifact or source pin that differs from the runtime
   lock until a new provenance and license review is completed.

This is a repository-owner distribution decision, not a general legal opinion
about other VinQut or Pilot versions. Final production approval remains bound
to the exact release artifact and evidence manifest.
