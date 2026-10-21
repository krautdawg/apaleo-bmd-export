## MODIFIED Requirements

### Requirement: Core modules do not depend on source adapters
The lint configuration SHALL fail when code under `src/core`, `src/bmd`, `src/mapping` or `src/posting` imports from `src/sources/`.

#### Scenario: Forbidden import is caught
- **WHEN** a file in `src/posting` imports a module from `src/sources/apaleo`
- **THEN** `pnpm lint` reports a `no-restricted-imports` error and exits non-zero

#### Scenario: BMD writer stays PMS-neutral
- **WHEN** a file in `src/bmd` imports a module from `src/sources/apaleo`
- **THEN** `pnpm lint` reports a `no-restricted-imports` error and exits non-zero
