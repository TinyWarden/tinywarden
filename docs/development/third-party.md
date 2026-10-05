# Third-party material

TinyWarden's original source uses Apache-2.0. Copied shadcn card and badge source
retains its MIT notice in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
The official registry was used via shadcn CLI 4.21.0; retain notices when modifying
or redistributing those files.

Direct runtime dependencies: Next, React, React DOM, Radix UI, cn, Kysely, pg and
tsx use MIT; Nodemailer uses MIT-0;
class-variance-authority uses Apache-2.0. Direct development dependencies use MIT
except TypeScript (Apache-2.0). The lockfile records exact resolved packages and
integrity hashes. Package-installed LICENSE/NOTICE files retain upstream terms.
Do not copy dependency source into this repository without preserving its notices.

The transitive lockfile also includes the following material. Do not label the
entire dependency graph Apache-2.0 or MIT:

- Sharp/libvips native packages include LGPL-3.0-or-later libraries. See the
  [libvips distribution](https://github.com/lovell/sharp-libvips) and installed
  package license/notice files when preparing native artifacts.
- Lightning CSS uses [MPL-2.0](https://github.com/parcel-bundler/lightningcss/blob/master/LICENSE).
- caniuse-lite data uses [CC-BY-4.0](https://github.com/browserslist/caniuse-lite/blob/main/LICENSE).
- Other locked packages declare ISC, BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0 or 0BSD.

Copied component source retains its notices; installed dependency implementation
is not copied into the repository. Before shipping
a bundle or native archive, inventory its actual contents, retain attribution and
license notices, and satisfy applicable corresponding-source and library-replacement
requirements. Record that packaging evidence with the release; package installation
alone does not establish redistribution completeness.

The Go agent currently uses only the Go standard library. Build/scanning tools are
separate from the agent module. No handoff source, commercial SDKs or product telemetry are bundled. The app uses Bricolage Grotesque and
IBM Plex Sans/Mono, unmodified local WOFF2 files under SIL OFL 1.1. Their full
upstream copyright/license notices are retained in `public/fonts`.
Icons are small original SVG paths; the proposal export runtime is not imported.
The fixed native-job build uses existing locked esbuild 0.28.2 (MIT); application
source/catalogs are bundled and third-party packages remain external.

At release packaging, include applicable dependency notices with the distributed
artifact and review any changed dependencies. A scaffold license check is not proof
that a future binary or bundle contains all notices.


Nodemailer 10.0.13 (MIT-0) and @types/nodemailer 8.0.2 (MIT) are pinned in the
lockfile. The library owns SMTP/MIME; its source is not copied into this repository.
Reconcile actual artifact contents, dependency notices and license obligations
when packaging a release.
