## Context

b03 switched the pipeline to `bmdTarget`, the mapping to the BMD format and the template to the EKR. It left the DATEV code in place but unreachable: `src/export`, `src/cli`, `src/posting` and the reachable parts of `src/mapping` no longer import it. The review of b03 then shows only the switch; this slice shows only deletions.

## Goals / Non-Goals

**Goals:**
- No DATEV code, template, test or doc left outside the CHANGELOG and the origin note.
- Byte-identical BMD output before and after.

**Non-Goals:**
- Rewording the remaining docs (b08).

## Decisions

1. **Delete, do not deprecate.** The product never shipped a DATEV mode under this name; there is no user to migrate. DATEV users keep using apaleo-datev-export.
2. **Proof of no behaviour change.** The slice ends with `pnpm test` without `UPDATE_GOLDEN`: every BMD golden file, the `docs/examples/` comparison and the demo stay unchanged. A diff of the test list shows only removed DATEV tests.
3. **Finding codes follow the source.** The docs test already fails when a documented code no longer exists in the source; deleting the SKR, Automatikkonto, Grman and EXTF codes from `docs/troubleshooting.md` together with their code keeps it green.

## Risks / Trade-offs

- [A shared helper still lives in `src/datev`] → b02 moved the CP1252 encoder to `src/core`; `grep -rni "datev" src test templates` must find nothing before the slice ends.

## Migration Plan

None.

## Open Questions

None.
