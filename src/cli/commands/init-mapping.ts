import { UsageError, UserError } from '../../core/errors.js';
import { formatFinding } from '../../core/findings.js';
import {
  VAT_ACCOUNT_TYPES,
  appendRows,
  loadTemplate,
  mappingHeaderComment,
  newRows,
  parseMapping,
  renderMappingFile,
  suggestRows,
  type MappingRowValues,
  type TemplateSettings,
} from '../../mapping/index.js';
import { CONFIG_OPTION, EXIT_OK, stringOption, type Command } from '../command.js';
import type { CommandContext } from '../context.js';
import { readIfExists, writeFileAtomic } from '../files.js';
import { mappingPath } from '../mapping-file.js';
import { createSource, loadCommandConfig } from '../source.js';
import { formatTable } from '../table.js';

/** The templates `--template` accepts. */
const TEMPLATES = ['ekr'] as const;

export const initMapping: Command = {
  name: 'init-mapping',
  summary: 'Write a mapping CSV for a property from its apaleo chart of accounts and the EKR hotel template',
  usage: '--property <id> [--template ekr] [--out <file>] [--update] [--config <path>]',
  options: {
    property: { type: 'string', valueName: '<id>', description: 'apaleo property id, for example BSP' },
    template: { type: 'string', valueName: '<ekr>', description: 'Template of the suggestions: ekr, the Austrian Einheitskontenrahmen (default)' },
    out: { type: 'string', valueName: '<file>', description: 'Mapping file (default: properties[].mapping or ./mapping-<id>.csv)' },
    update: { type: 'boolean', description: 'Append rows for new apaleo accounts to an existing file; existing rows stay unchanged' },
    ...CONFIG_OPTION,
  },
  async run(args, ctx) {
    const propertyId = stringOption(args.values, 'property');
    if (!propertyId) throw new UsageError('init-mapping needs --property <id>. Run "apaleo-bmd properties" to list them.');
    const template = stringOption(args.values, 'template') ?? 'ekr';
    if (!(TEMPLATES as readonly string[]).includes(template)) {
      throw new UsageError(`--template must be ${TEMPLATES.join(' or ')} (the Austrian Einheitskontenrahmen), got "${template}".`);
    }
    const update = args.values.update === true;

    const loaded = await loadCommandConfig(args.values, ctx);
    const { sachkontenlaenge, personenkontenlaenge, dialect } = loaded.config.bmd;
    const settings: TemplateSettings = { sachkontenlaenge, personenkontenlaenge, dialect };
    const path = mappingPath(loaded, propertyId, stringOption(args.values, 'out'), ctx.cwd);
    const existing = await readIfExists(ctx, path);
    if (existing && !update) {
      throw new UserError(
        `${path} already exists and was not changed. Run again with --update to add new apaleo accounts to it, ` +
          'or choose another file with --out.',
      );
    }
    // Read the file before calling apaleo, so a broken file fails fast.
    const mapping = existing ? parseMapping(existing, { path, sachkontenlaenge }) : undefined;

    const accounts = await createSource(loaded, ctx).getChartOfAccounts(propertyId);
    const ekr = await loadTemplate();
    const suggestion = suggestRows(accounts, ekr, settings);
    for (const finding of suggestion.findings) ctx.stdout.write(`${formatFinding(finding)}\n`);

    if (!existing || !mapping) {
      await writeFileAtomic(ctx, path, renderMappingFile([mappingHeaderComment(ekr, settings)], suggestion.rows));
      ctx.stdout.write(`Wrote ${path} from template ${ekr.id} for property ${propertyId}.\n`);
      printCounts(ctx, suggestion.rows);
      ctx.stdout.write(
        'Every row is a suggestion (Vorschlag, ungeprüft): have your Steuerberatung check the file, fill in the empty BMD accounts, ' +
          'then run "apaleo-bmd mapping check".\n',
      );
      return EXIT_OK;
    }

    const added = newRows(mapping.rows, suggestion.rows);
    if (added.length === 0) {
      ctx.stdout.write(`No new apaleo accounts: ${path} is unchanged.\n`);
      return EXIT_OK;
    }
    await writeFileAtomic(ctx, path, appendRows(existing, added));
    ctx.stdout.write(`Updated ${path}: existing rows unchanged.\n`);
    printAdded(ctx, added);
    return EXIT_OK;
  },
};

function printCounts(ctx: CommandContext, rows: readonly MappingRowValues[]): void {
  const needed = rows.filter((row) => !VAT_ACCOUNT_TYPES.has(row.apaleoType));
  const mapped = needed.filter((row) => row.bmdAccount !== '').length;
  const vatRows = rows.length - needed.length;
  ctx.stdout.write(
    `${rows.length} rows: ${mapped} mapped, ${needed.length - mapped} unmapped` +
      (vatRows > 0 ? `, ${vatRows} VAT account row(s) that need no BMD account` : '') +
      '.\n',
  );
}

function printAdded(ctx: CommandContext, added: readonly MappingRowValues[]): void {
  if (added.length === 0) {
    ctx.stdout.write('No new apaleo accounts.\n');
    return;
  }
  ctx.stdout.write(`Added ${added.length} row(s) for new apaleo accounts:\n`);
  const rows = added.map((row) => [
    row.apaleoAccount,
    row.apaleoType,
    row.apaleoName,
    row.apaleoVatPercent === '' ? '' : `${row.apaleoVatPercent} %`,
    row.bmdAccount || '(unmapped)',
  ]);
  ctx.stdout.write(formatTable(rows, [], '  '));
  printCounts(ctx, added);
}
