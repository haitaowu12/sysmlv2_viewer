import type { SyncPatch } from '../bridge/semantic-types';

export interface AiAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

export interface GenerateModelResponse {
  sysml: string;
  drawioXml: string;
  diagnostics: string[];
  notes?: string[];
}

export interface EditModelResponse {
  sysml: string;
  drawioXml: string;
  appliedPatches: SyncPatch[];
  reviewPatches: SyncPatch[];
  diagnostics: string[];
}

export interface ValidateDrawioResponse {
  valid: boolean;
  diagnostics: string[];
}
