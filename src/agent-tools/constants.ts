import type { CorpusPin } from './types';

export const SYSML_V2_CORPUS: Readonly<CorpusPin> = Object.freeze({
  repository: 'https://github.com/Systems-Modeling/SysML-v2-Release',
  tag: '2026-04',
  commit: '9baca5908ca28b53da085de69336fde48420ea8f',
});

export const AGENT_TOOL_SCHEMA_VERSION = '1.0' as const;
export const DEFAULT_RESULT_LIMIT = 100;
