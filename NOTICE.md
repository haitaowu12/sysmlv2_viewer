# SysML Engineering Workbench notices

The repository does not yet declare a product license. Distribution of a
release remains blocked until the owner selects and records that license.

The qualified Phase 1 runtime is assembled locally from separately licensed
components and is not committed as a binary:

- VinQut `373dfb960860c3ac259f56169ddabc06d2847eca`: MIT wrapper code.
- SysML v2 Pilot Implementation: the VinQut fat-JAR notice identifies bundled
  Pilot software as LGPL-3.0-or-later, while the pinned Pilot checkout
  currently declares EPL-2.0. Public runtime redistribution is blocked until
  the redistributed class provenance and applicable obligations are
  reconciled.
- Spec42 `a3f066ee4095a0eb8b37545ffd4846d42804658a`: MIT.
- SysML v2 Release
  `de1070ae8e79c21532b8004fc663d47b35d0e9fa`: use and redistribution
  remain subject to the notices in that upstream release.

Packaged distributions must reproduce the complete upstream license and notice
files. The runtime lock verifies artifact hashes; it does not replace license
compliance or legal review.
