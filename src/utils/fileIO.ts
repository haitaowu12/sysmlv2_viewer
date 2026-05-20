/**
 * File I/O utilities
 */

const SUPPORTED_IMPORT_EXTENSIONS = ['.sysml', '.kerml', '.txt', '.drawio'] as const;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export function validateImportFile(file: Pick<File, 'name' | 'size'>): void {
  const lowerName = file.name.toLowerCase();
  const isSupported = SUPPORTED_IMPORT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));

  if (!isSupported) {
    throw new Error(`Unsupported file type. Open ${SUPPORTED_IMPORT_EXTENSIONS.join(', ')} files only.`);
  }

  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('File is too large. Maximum supported import size is 2 MB.');
  }
}

export async function readSupportedTextFile(file: File): Promise<{ name: string; content: string }> {
  validateImportFile(file);
  const content = await file.text();
  return { name: file.name, content };
}

export function openFileDialog(): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SUPPORTED_IMPORT_EXTENSIONS.join(',');
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve(await readSupportedTextFile(file));
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

export function downloadFile(content: string, fileName: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSVG(svgElement: SVGElement, fileName: string) {
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  downloadBlob(blob, fileName);
}

export async function svgToPngBlob(svgText: string): Promise<Blob> {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load SVG for PNG export.'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.width || 1600;
    canvas.height = image.height || 900;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context is unavailable.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error('Failed to produce PNG blob.'));
          return;
        }
        resolve(result);
      }, 'image/png');
    });

    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function setupDragDrop(
  element: HTMLElement,
  onDrop: (name: string, content: string) => void,
  onError?: (message: string) => void,
): () => void {
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.add('drag-over');
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove('drag-over');
  };

  const onFileDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove('drag-over');

    const file = e.dataTransfer?.files[0];
    if (file) {
      try {
        const { name, content } = await readSupportedTextFile(file);
        onDrop(name, content);
      } catch (error) {
        onError?.((error as Error).message);
      }
    }
  };

  element.addEventListener('dragover', onDragOver);
  element.addEventListener('dragleave', onDragLeave);
  element.addEventListener('drop', onFileDrop);

  return () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('dragleave', onDragLeave);
    element.removeEventListener('drop', onFileDrop);
  };
}
