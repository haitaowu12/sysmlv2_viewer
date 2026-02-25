/**
 * File I/O utilities
 */

export function openFileDialog(): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sysml,.kerml,.txt,.drawio';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const content = await file.text();
      resolve({ name: file.name, content });
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
) {
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.add('drag-over');
  });

  element.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove('drag-over');
  });

  element.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove('drag-over');

    const file = e.dataTransfer?.files[0];
    if (file) {
      const content = await file.text();
      onDrop(file.name, content);
    }
  });
}
