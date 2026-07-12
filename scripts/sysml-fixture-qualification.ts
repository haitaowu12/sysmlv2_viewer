#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { qualifyOfficialCorpus } from '../src/qualification/official-fixture-qualification';

function option(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function main(): number {
  const args = process.argv.slice(2);
  const corpus = option(args, '--corpus') ?? process.env.SYSML_V2_RELEASE_DIR;
  const output = option(args, '--output');
  if (!corpus) throw new Error('--corpus or SYSML_V2_RELEASE_DIR is required');
  const report = qualifyOfficialCorpus(corpus);
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (output) writeFileSync(resolve(output), rendered, 'utf8');
  else process.stdout.write(rendered);
  return report.summary.status === 'pass' ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
