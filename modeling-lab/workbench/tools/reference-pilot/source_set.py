"""Explicit SysML source-set assembly with original-file diagnostic/source maps."""
import hashlib
import json
from pathlib import Path


def assemble(manifest_path, output, *, manifest_raw=None):
    manifest=json.loads(manifest_raw if manifest_raw is not None else manifest_path.read_bytes())
    if manifest.get('schemaVersion')!=1 or not isinstance(manifest.get('files'),list) or not manifest['files']:
        raise ValueError('Source set requires schemaVersion 1 and nonempty files')
    root=manifest_path.parent.resolve(); records=[]; seen=set()
    if not all(isinstance(name,str) for name in manifest['files']):
        raise ValueError('Source file names must be strings')
    for name in sorted(manifest['files']):
        path=(root/name).resolve()
        if not path.is_relative_to(root) or path.suffix!='.sysml' or path in seen:
            raise ValueError('Source set files must be distinct .sysml files within the manifest directory')
        seen.add(path)
        records.append({'path':name,'raw':path.read_bytes()})
    source,mapping=assemble_memory(records)
    output.write_text(source)
    return mapping


def assemble_memory(records):
    """Join explicit original bytes; callers own file admission and size limits."""
    chunks=[];mapping=[];next_line=1
    for record in sorted(records,key=lambda item:item['path']):
        name=record['path'];raw=record['raw'];text=raw.decode('utf-8')
        if not text.endswith('\n'):text+='\n'
        lines=text.count('\n')
        mapping.append({'path':name,'sha256':hashlib.sha256(raw).hexdigest(),'startLine':next_line,'endLine':next_line+lines-1})
        chunks.append(text);next_line+=lines
    return ''.join(chunks),mapping


def source_location(line,mapping):
    if not isinstance(line,int):return None
    for entry in mapping:
        if entry['startLine']<=line<=entry['endLine']:
            return {'path':entry['path'],'line':line-entry['startLine']+1,'sha256':entry['sha256']}
    return None
