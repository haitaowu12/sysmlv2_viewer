#!/usr/bin/env node
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import {
  sysmlCheck,
  sysmlDoctor,
  sysmlExplainDiagnostic,
  sysmlModelSummary,
  type AgentToolFile,
} from '../src/agent-tools';

type ToolName = 'doctor' | 'check' | 'explain-diagnostic' | 'model-summary';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const context = {
  engineVersion: 'bridge-v1',
  packageVersion: packageJson.version,
};

const MAX_FILES = 100;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

function readFiles(paths: string[], approvedRoot: string): AgentToolFile[] {
  if (paths.length > MAX_FILES) throw new Error(`file count exceeds ${MAX_FILES}`);
  let root: string;
  try {
    root = realpathSync(resolve(approvedRoot));
  } catch {
    throw new Error('approved root could not be resolved');
  }
  let totalBytes = 0;
  return paths.map((path) => {
    let absolutePath: string;
    try {
      absolutePath = realpathSync(resolve(path));
    } catch {
      throw new Error('file could not be read');
    }
    if (absolutePath !== root && !absolutePath.startsWith(root + sep)) {
      throw new Error('file is outside approved root');
    }
    if (extname(absolutePath).toLowerCase() !== '.sysml') {
      throw new Error('only .sysml files are accepted');
    }
    const size = statSync(absolutePath).size;
    if (size > MAX_FILE_BYTES) throw new Error(`file exceeds ${MAX_FILE_BYTES} bytes`);
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`files exceed ${MAX_TOTAL_BYTES} bytes total`);
    return {
      path: absolutePath,
      content: readFileSync(absolutePath, 'utf8'),
    };
  });
}

function takeOption(args: string[], flag: string): { args: string[]; value?: string } {
  const index = args.indexOf(flag);
  if (index < 0) return { args };
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return {
    args: args.filter((_, itemIndex) => itemIndex !== index && itemIndex !== index + 1),
    value,
  };
}

function parseLimit(args: string[], flag: string): { args: string[]; limit?: number } {
  const index = args.indexOf(flag);
  if (index < 0) return { args };
  const raw = args[index + 1];
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new Error(`${flag} requires a non-negative integer`);
  }
  return {
    args: args.filter((_, itemIndex) => itemIndex !== index && itemIndex !== index + 1),
    limit: Number(raw),
  };
}

function emit(value: unknown, exitCode = 0): never {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(exitCode);
}

function fail(message: string): never {
  emit({
    schemaVersion: '1.0',
    tool: 'sysml_agent_tools',
    error: message,
    mutationPerformed: false,
  }, 2);
}

function main(): never {
  const [rawTool, ...rawArgs] = process.argv.slice(2);
  const tool = rawTool as ToolName | undefined;

  try {
    if (tool === 'explain-diagnostic') {
      const code = rawArgs[0];
      if (!code) fail('explain-diagnostic requires a diagnostic code');
      emit(sysmlExplainDiagnostic({ context, code }));
    }

    const approvedRoot = takeOption(rawArgs, '--root');
    const diagnosticsLimit = parseLimit(approvedRoot.args, '--max-diagnostics');
    const elementLimit = parseLimit(diagnosticsLimit.args, '--max-elements');
    const files = readFiles(elementLimit.args, approvedRoot.value ?? process.cwd());

    if (tool === 'doctor') {
      emit(sysmlDoctor({ context, files, maxDiagnostics: diagnosticsLimit.limit }));
    }
    if (tool === 'check') {
      if (files.length === 0) fail('check requires at least one SysML file');
      const result = sysmlCheck({ context, files, maxDiagnostics: diagnosticsLimit.limit });
      emit(result, result.valid ? 0 : 1);
    }
    if (tool === 'model-summary') {
      if (files.length === 0) fail('model-summary requires at least one SysML file');
      emit(sysmlModelSummary({ context, files, maxElements: elementLimit.limit }));
    }

    fail(`Unknown tool '${rawTool ?? ''}'. Expected doctor, check, explain-diagnostic, or model-summary.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(message);
  }
}

main();
