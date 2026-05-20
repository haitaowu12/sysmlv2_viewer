import { describe, expect, it } from 'vitest';
import { readSupportedTextFile, setupDragDrop, validateImportFile } from '../utils/fileIO';

describe('file import safeguards', () => {
  it('accepts supported SysML text files', async () => {
    const file = new File(['package Demo;'], 'demo.sysml', { type: 'text/plain' });

    await expect(readSupportedTextFile(file)).resolves.toEqual({
      name: 'demo.sysml',
      content: 'package Demo;',
    });
  });

  it('rejects unsupported file extensions before reading content', () => {
    const file = new File(['package Demo;'], 'demo.exe');

    expect(() => validateImportFile(file)).toThrow(/unsupported file type/i);
  });

  it('rejects files over the import size limit', () => {
    expect(() => validateImportFile({ name: 'large.sysml', size: 2 * 1024 * 1024 + 1 })).toThrow(
      /file is too large/i,
    );
  });

  it('returns a cleanup function for drag-and-drop listeners', () => {
    const element = document.createElement('div');
    const cleanup = setupDragDrop(element, () => undefined);

    expect(cleanup).toEqual(expect.any(Function));
    cleanup();
  });
});
