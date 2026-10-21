## Context

`schedule --once` computes due periods in `schedule.timezone` and in each property's own time zone and only writes periods that are final (D+2 after `finalAfter`). For an Austrian property both are Europe/Vienna, which has the same offsets as Europe/Berlin, so the behaviour does not change for correctly configured systems; only the default and the examples were German. The Dockerfile is multi-stage, non-root (`node`), with `/config` and `/data` volumes; CI builds it on every pull request without pushing.

## Goals / Non-Goals

**Goals:**
- Defaults that are right for an Austrian hotel without editing.
- An image whose name and labels say what it is, and a CI job that proves the BMD demo runs in it.

**Non-Goals:**
- Publishing the image; the README keeps saying there is no registry image.

## Decisions

1. **Default `Europe/Vienna`.** Matching the audience; the property time zone check still protects hotels elsewhere. Alternative: no default (required key); rejected, a missing key would block the first `schedule --once` for no benefit.
2. **Image name only local.** `apaleo-bmd-export:local` via compose `image:` with `build:`; no registry prefix, so nothing suggests a pull.
3. **CI runs the demo, not a live export.** The demo needs no secret; the job asserts the demo file name, which also proves the file naming and the `-w /data` hint.

## Risks / Trade-offs

- [Someone relied on the Berlin default] → no users yet; CHANGELOG entry in b07.
- [The CI demo assertion couples to the file name] → intended: a rename must be deliberate.

## Migration Plan

None.

## Open Questions

None.
