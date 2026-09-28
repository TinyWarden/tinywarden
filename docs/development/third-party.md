# Third-party material

TinyWarden's original source uses Apache-2.0. Copied shadcn card and badge source
retains its MIT notice in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
The official registry was used via shadcn CLI 4.21.0; retain notices when modifying
or redistributing those files.

Direct runtime dependencies: Next, React, React DOM, Radix UI, cn, Kysely, pg and
tsx use MIT;
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

No dependency implementation is copied into this source scaffold. Before shipping
a bundle or native archive, inventory its actual contents, retain attribution and
license notices, and satisfy applicable corresponding-source and library-replacement
requirements. Record that packaging evidence with the release; package installation
alone does not establish redistribution completeness.

The Go agent currently uses only the Go standard library. Build/scanning tools are
separate from the agent module. No handoff source, external assets, fonts, icons,
commercial SDKs or product telemetry are bundled.

P1.B installed Kysely 0.29.6, pg 8.23.0, tsx 4.23.15 and @types/pg 8.23.1.
Their installed package metadata declares MIT. Reconcile the full actual dependency
graph, notices and packaging at phase closeout.

At release packaging, include applicable dependency notices with the distributed
artifact and review any changed dependencies. A scaffold license check is not proof
that a future binary or bundle contains all notices.
