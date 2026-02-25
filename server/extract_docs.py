#!/usr/bin/env python3
"""Best-effort extractor for PDF and DOCX text."""

from __future__ import annotations

import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET


def read_stdin() -> bytes:
    payload = sys.stdin.read().strip()
    if not payload:
        return b""
    try:
        return base64.b64decode(payload)
    except Exception:
        return b""


def extract_docx(data: bytes) -> str:
    if not data:
        return ""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            with archive.open('word/document.xml') as doc:
                xml_bytes = doc.read()
        root = ET.fromstring(xml_bytes)
        text_nodes = []
        for element in root.iter():
            if element.tag.endswith('}t') and element.text:
                text_nodes.append(element.text)
        return ' '.join(text_nodes).strip()
    except Exception:
        return ""


def extract_pdf(data: bytes) -> str:
    if not data:
        return ""

    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(io.BytesIO(data))
        chunks = []
        for page in reader.pages:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                continue
        return '\n'.join(chunks).strip()
    except Exception:
        pass

    printable = []
    run = []
    for byte in data:
        if 32 <= byte <= 126:
            run.append(chr(byte))
        else:
            if len(run) >= 6:
                printable.append(''.join(run))
            run = []
    if len(run) >= 6:
        printable.append(''.join(run))

    return ' '.join(printable[:400]).strip()


def main() -> None:
    mime = sys.argv[1] if len(sys.argv) > 1 else ''
    data = read_stdin()

    if mime == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        text = extract_docx(data)
    elif mime == 'application/pdf':
        text = extract_pdf(data)
    else:
        text = ''

    sys.stdout.write(json.dumps({'text': text}, ensure_ascii=False))


if __name__ == '__main__':
    main()
EOF && chmod +x server/extract_docs.py