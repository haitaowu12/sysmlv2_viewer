"""Bounded immutable source-set intake and separate revision-bound presentation maps."""
import hashlib
import re
from source_set import assemble_memory,source_location

SOURCE_LIMIT=524288
MAX_FILES=64
PATH_LIMIT=500


def source_bytes(source):
    if not isinstance(source,str):raise ValueError('Model source must be UTF-8 text')
    try:return source.encode('utf-8')
    except UnicodeEncodeError as error:raise ValueError('Model source must be valid UTF-8 text') from error


def admit_path(path):
    if (not isinstance(path,str) or not 1<=len(path)<=PATH_LIMIT or not path.endswith('.sysml')
            or path.startswith('/') or '\\' in path or ':' in path
            or any(ord(char)<32 or ord(char)==127 for char in path)
            or any(part in ('','.','..') for part in path.split('/'))):
        raise ValueError('Source paths must be distinct relative .sysml paths without traversal')
    source_bytes(path)
    return path


def assemble_records(records):
    if not isinstance(records,list) or not 1<=len(records)<=MAX_FILES:
        raise ValueError('Choose 1–64 SysML source files')
    seen=set();checked=[];total=0
    for item in records:
        if not isinstance(item,dict):raise ValueError('Invalid source file record')
        path=admit_path(item.get('path'))
        if path in seen:raise ValueError('Duplicate source path: '+path)
        seen.add(path);source=item.get('source');raw=source_bytes(source);total+=len(raw)
        if total>SOURCE_LIMIT:raise ValueError('Combined model source exceeds 512 KiB')
        checked.append({'path':path,'source':source,'raw':raw})
    checked.sort(key=lambda item:item['path'])
    source,mapping=assemble_memory(checked)
    if len(source_bytes(source))>SOURCE_LIMIT:raise ValueError('Assembled model source exceeds 512 KiB')
    metadata={'schemaVersion':1,'files':[{'path':item['path'],'source':item['source']} for item in checked],
              'assembledSourceSha256':hashlib.sha256(source_bytes(source)).hexdigest()}
    return {'source':source,'sourceSet':metadata,'sourceMap':mapping}


def admit_source_set(metadata,baseline_source=None):
    if not isinstance(metadata,dict) or type(metadata.get('schemaVersion')) is not int or metadata.get('schemaVersion')!=1:
        raise ValueError('Unsupported source set metadata')
    result=assemble_records(metadata.get('files'))
    if (not isinstance(metadata.get('assembledSourceSha256'),str)
            or not re.fullmatch('[a-f0-9]{64}',metadata['assembledSourceSha256'])
            or metadata['assembledSourceSha256']!=result['sourceSet']['assembledSourceSha256']):
        raise ValueError('Original source set and assembled revision do not match')
    if baseline_source is not None and baseline_source!=result['source']:
        raise ValueError('Project baseline does not match the original source set')
    return result


def presentation_mapping(source,metadata):
    result=admit_source_set(metadata)
    revision=hashlib.sha256(source_bytes(source)).hexdigest()
    original=revision==result['sourceSet']['assembledSourceSha256']
    return {'status':'original' if original else 'edited','sourceSha256':revision,
            'sourceMap':result['sourceMap'] if original else []}


def source_locations(report,metadata):
    """Return presentation data; never modify the report or its sealed evidence."""
    presentation=presentation_mapping(report['source'],metadata)
    if report.get('sourceSha256') not in (None,presentation['sourceSha256']):
        raise ValueError('Report source and source revision do not match')
    mapping=presentation['sourceMap'];elements={};diagnostics=[]
    for element in report.get('elements',[]):
        location=source_location(element.get('line'),mapping)
        identity=element.get('sessionElementId')
        if location and identity:elements[identity]=location
    for index,diagnostic in enumerate(report.get('diagnostics',[])):
        location=source_location(diagnostic.get('line'),mapping)
        if location:diagnostics.append({'index':index,'originalSource':location})
    return {**presentation,'elements':elements,'diagnostics':diagnostics}
