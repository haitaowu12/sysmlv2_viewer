/**
 * File I/O utilities
 */

export function openFileDialog(): Promise<{ name: string; content: string } | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.sysml,.kerml,.txt';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) { resolve(null); return; }
            const content = await file.text();
            resolve({ name: file.name, content });
        };
        input.click();
    });
}

export function downloadFile(content: string, fileName: string) {
    const blob = new Blob([content], { type: 'text/plain' });
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

export function setupDragDrop(
    element: HTMLElement,
    onDrop: (name: string, content: string) => void
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
