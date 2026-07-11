#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function readFiles(paths: string[]): AgentToolFile[] {
  return paths.map((path) => {
    const absolutePath = resolve(path);
    return {
      path: absolutePath,
      content: readFileSync(absolutePath, 'utf8'),
    };
  });
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

    const diagnosticsLimit = parseLimit(rawArgs, '--max-diagnostics');
    const elementLimit = parseLimit(diagnosticsLimit.args, '--max-elements');
    const files = readFiles(elementLimit.args);

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
