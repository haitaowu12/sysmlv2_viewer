import type { SyncPatch } from '../bridge/semantic-types';

export interface AiAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

export interface AiProviderStatus {
  requestedProvider: 'local' | 'openai' | 'anthropic' | 'google' | string;
  effectiveProvider: 'local' | 'openai' | 'anthropic' | 'google' | string;
  model: string;
  source: 'provider' | 'local_heuristic';
  usedFallback: boolean;
  reason?: string;
}

export interface GenerateModelResponse {
  sysml: string;
  drawioXml?: string;
  diagnostics: string[];
  notes?: string[];
  providerStatus: AiProviderStatus;
}

export interface EditModelResponse {
  sysml: string;
  drawioXml?: string;
  appliedPatches: SyncPatch[];
  reviewPatches: SyncPatch[];
  diagnostics: string[];
  providerStatus: AiProviderStatus;
}

export interface ValidateDrawioResponse {
  valid: boolean;
  diagnostics: string[];
}
