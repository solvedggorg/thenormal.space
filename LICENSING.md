# Licensing

This repository is a monorepo with two licenses.

## MIT (this project)

Copyright (c) 2026 The Normal People Society

Everything in this repository **except** `links/` is licensed under the MIT License. See [LICENSE](LICENSE).

That includes the marketing site (`src/`), `api/`, `auth/`, `store/`, `shared/`, and the root tooling.

## AGPL-3.0 (`links/`)

`links/` is [Sink](https://github.com/ccbikai/Sink), a URL shortener. Sink is licensed under the GNU Affero General Public License v3.0. The upstream license text is in [links/LICENSE](links/LICENSE). A copy also lives at [LICENSE-AGPL](LICENSE-AGPL).

If you run a modified `links/` instance as a network service, AGPL section 13 requires you to offer that modified source to its users.

## Using a subset

- Site, API, auth, or shop only: MIT.
- Anything that includes `links/`: keep the AGPL notices and obligations for that tree.
