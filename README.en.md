# apaleo-bmd-export

**Deutsch:** [README.md](README.md)

Free, open-source export from the apaleo hotel PMS to BMD Buchungsimport files that an Austrian Steuerberater or Buchhaltung imports into BMD NTCS (or BMD 5.5 with `bmd.dialect: bmd55`). It reads the apaleo ledger of a month through a read-only apaleo custom app, books every line with an account mapping per property (an Einheitskontenrahmen hotel template), passes net amount and VAT separately so that BMD books exactly the VAT apaleo charged, and writes one file per property and month. It runs on your own machine or in a locally built Docker container. No subscription, no hosted service.

The file follows the documented BMD import layout (PR08/PR08A); a first test import with a Kanzlei is still pending. The tool is built on [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export), which writes DATEV files for Germany.

> **No warranty, not tax advice.** Your Steuerberater must review the account mapping and the first BMD imports. Read the [disclaimer](DISCLAIMER.md) (the German text is binding, an English translation follows it).

## Quick start

There is no npm package or container image release yet. You install from source.

1. Create an apaleo custom app (Apps > Connected apps > Add a new app > Add custom app, page "New simple client", personal data "Omit all") with the permissions in [docs/setup-apaleo.md](docs/setup-apaleo.md).
2. Install (needs Node.js 24 and git):

   ```sh
   git clone https://github.com/krautdawg/apaleo-bmd-export.git
   cd apaleo-bmd-export
   corepack enable
   pnpm install --frozen-lockfile
   pnpm build
   node dist/cli/main.js --help
   ```

   The commands below use `apaleo-bmd` (after `pnpm link --global`). Without it, type `node dist/cli/main.js` instead.

3. Try it on the bundled demo data, without apaleo: `node dist/cli/main.js export --month 2026-09 --demo --dry-run`.
4. Copy `apaleo-bmd.config.example.yaml` to `apaleo-bmd.config.yaml`, fill in the client id, the Buchungssymbol your Kanzlei created in BMD and your property under `properties` (`apaleo-bmd properties` lists the ids; `export` exports every property listed there), and set the secret in the environment (`APALEO_CLIENT_SECRET`), never in the file. Then create the mapping, have your Steuerberater check it, and export:

   ```sh
   apaleo-bmd init-mapping --property BSP --template ekr
   apaleo-bmd export --month 2026-09 --dry-run
   apaleo-bmd export --month 2026-09
   ```

## Documentation (German)

The documentation is written in German for hotels and their Kanzlei in Austria:

- [README.md](README.md): overview, quick start, Docker, comparison, FAQ
- [docs/setup-apaleo.md](docs/setup-apaleo.md): the apaleo custom app and its permissions
- [docs/mapping-guide.md](docs/mapping-guide.md): the account mapping (EKR, Steuercodes, Ortstaxe, Anzahlungen), for the Steuerberater
- [docs/bmd-import.md](docs/bmd-import.md): importing the file into BMD NTCS and the first-import checklist
- [docs/bmd-format.md](docs/bmd-format.md): the fields of the file and the sources they were checked against
- [docs/configuration.md](docs/configuration.md), [docs/docker.md](docs/docker.md), [docs/troubleshooting.md](docs/troubleshooting.md)
- [docs/architecture.md](docs/architecture.md): modules and how to add a source or a target writer

## Contributing

Issues and pull requests in English are welcome. Code, identifiers, CLI output and commit messages are English. Read [CONTRIBUTING.md](CONTRIBUTING.md) (German) and [SECURITY.md](SECURITY.md) first; fixtures never contain real guest data.

## Licence

[MIT](LICENSE). Not affiliated with apaleo GmbH or BMD Systemhaus GesmbH.
