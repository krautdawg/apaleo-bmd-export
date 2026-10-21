import type { Config } from '../core/config.js';
import type { Finding } from '../core/findings.js';
import type { Skr } from '../mapping/index.js';
import type { PeriodPart } from './period.js';

/** What a target needs to name and render the file of one property and period. */
export interface TargetFileMeta {
  /** The whole config: a target reads its own section (for example `datev`). */
  config: Config;
  propertyId: string;
  part: PeriodPart;
  /** The Mandant's chart of accounts, from the config or the mapping file. */
  skr: Skr;
  /** `export --demo`: the file name and the file itself must say so. */
  demo: boolean;
  createdAt: Date;
}

export interface RenderedFile {
  bytes: Uint8Array;
  /** `W-`/`N-` findings about values the writer changed (an invalid file throws a `FindingsError` instead). */
  findings: Finding[];
}

/**
 * The only way the export pipeline writes files (export-run, "Target writer
 * boundary"). `B` is the target's own booking type. The output folder logic
 * knows nothing about a target's file names or content: it finds existing and
 * overlapping files through `filePattern` and decides "unchanged" through
 * `sameContent`.
 */
export interface TargetWriter<B> {
  /** Short id, for example `datev`. */
  readonly id: string;
  /** The first line of the protocol beside each file. */
  readonly protocolTitle: string;
  /**
   * Matches the name of a current file of this target and captures its first
   * and last day as `YYYYMMDD` (groups 1 and 2). Must not match replaced files
   * (`.replaced-<timestamp>`) or protocols (`.protokoll.txt`).
   */
  readonly filePattern: RegExp;
  fileName(meta: TargetFileMeta): string;
  render(bookings: readonly B[], meta: TargetFileMeta): RenderedFile;
  /** True when `existing` and `next` differ at most in what changes on every run (such as a creation time). */
  sameContent(existing: Uint8Array, next: Uint8Array): boolean;
}

/** The part of a target the output folder logic uses. */
export type FolderTarget = Pick<TargetWriter<unknown>, 'filePattern' | 'sameContent'>;

/** Appended to the property id in the name of a demo file, so a demo file never looks like a real export in a file list. */
export const DEMO_FILE_MARKER = 'DEMO';

/** The property id as it appears in a file name: `BSP`, or `BSP_DEMO` for a demo file. */
export function fileTag(meta: Pick<TargetFileMeta, 'propertyId' | 'demo'>): string {
  return meta.demo ? `${meta.propertyId}_${DEMO_FILE_MARKER}` : meta.propertyId;
}
