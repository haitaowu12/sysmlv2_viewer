/* Immutable original files plus a revision-bound, recomputed presentation map. */
(() => {
  const SOURCE_LIMIT=524288,MAX_FILES=64,PATH_LIMIT=500;
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function bytes(source){
    if(typeof source!=='string')throw Error('Model source must be UTF-8 text');
    const raw=encoder.encode(source);
    if(decoder.decode(raw)!==source)throw Error('Model source must be valid UTF-8 text');
    return raw;
  }
  function pathName(path){
    if(typeof path!=='string'||![...path].length||[...path].length>PATH_LIMIT||!path.endsWith('.sysml')||path.startsWith('/')||/[\\:\u0000-\u001f\u007f]/.test(path)||path.split('/').some(part=>['','.','..'].includes(part)))throw Error('Source paths must be distinct relative .sysml paths without traversal');
    bytes(path);return path;
  }
  function comparePaths(a,b){
    const left=[...a],right=[...b];
    for(let i=0;i<Math.min(left.length,right.length);i++){const difference=left[i].codePointAt(0)-right[i].codePointAt(0);if(difference)return difference;}
    return left.length-right.length;
  }
  async function sha(raw){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
  async function assemble(records){
    if(!Array.isArray(records)||records.length<1||records.length>MAX_FILES)throw Error('Choose 1–64 SysML source files');
    const seen=new Set(),checked=[];let total=0;
    for(const item of records){
      if(!record(item))throw Error('Invalid source file record');
      const path=pathName(item.path);if(seen.has(path))throw Error('Duplicate source path: '+path);seen.add(path);
      const raw=bytes(item.source);total+=raw.length;if(total>SOURCE_LIMIT)throw Error('Combined model source exceeds 512 KiB');
      checked.push({path,source:item.source,raw});
    }
    checked.sort((a,b)=>comparePaths(a.path,b.path));
    const chunks=[],sourceMap=[];let nextLine=1;
    for(const item of checked){
      const text=item.source.endsWith('\n')?item.source:item.source+'\n',lines=text.split('\n').length-1;
      chunks.push(text);sourceMap.push({path:item.path,sha256:await sha(item.raw),startLine:nextLine,endLine:nextLine+lines-1});nextLine+=lines;
    }
    const source=chunks.join(''),raw=bytes(source);if(raw.length>SOURCE_LIMIT)throw Error('Assembled model source exceeds 512 KiB');
    return {source,sourceSet:{schemaVersion:1,files:checked.map(({path,source})=>({path,source})),assembledSourceSha256:await sha(raw)},sourceMap};
  }
  async function admit(sourceSet,baselineSource){
    if(!record(sourceSet)||sourceSet.schemaVersion!==1)throw Error('Unsupported source set metadata');
    const result=await assemble(sourceSet.files);
    if(typeof sourceSet.assembledSourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(sourceSet.assembledSourceSha256)||sourceSet.assembledSourceSha256!==result.sourceSet.assembledSourceSha256)throw Error('Original source set and assembled revision do not match');
    if(baselineSource!==undefined&&baselineSource!==result.source)throw Error('Project baseline does not match the original source set');
    return result;
  }
  async function mappingFor(sourceSet,currentSource){
    const original=await admit(sourceSet),sourceSha256=await sha(bytes(currentSource)),matches=sourceSha256===original.sourceSet.assembledSourceSha256;
    return {status:matches?'original':'edited',sourceSha256,sourceMap:matches?original.sourceMap:[]};
  }
  async function fromFiles(fileList){
    const files=Array.from(fileList);if(files.length<1||files.length>MAX_FILES)throw Error('Choose 1–64 SysML source files');
    const directory=files.every(file=>typeof file.webkitRelativePath==='string'&&file.webkitRelativePath.includes('/'))&&new Set(files.map(file=>file.webkitRelativePath.split('/')[0])).size===1;
    let total=0;const records=[];
    for(const file of files){
      const path=directory?file.webkitRelativePath.slice(file.webkitRelativePath.indexOf('/')+1):(file.webkitRelativePath||file.name);pathName(path);
      if(typeof file.size==='number'&&(file.size>SOURCE_LIMIT||total+file.size>SOURCE_LIMIT))throw Error('Combined model source exceeds 512 KiB');
      const raw=new Uint8Array(await file.arrayBuffer());total+=raw.length;if(total>SOURCE_LIMIT)throw Error('Combined model source exceeds 512 KiB');
      let source;try{source=decoder.decode(raw);}catch{throw Error('Source file '+path+' is not valid UTF-8');}
      records.push({path,source});
    }
    return assemble(records);
  }
  function sourceLocation(line,mapping){
    if(!Number.isInteger(line))return null;
    const item=mapping.find(entry=>entry.startLine<=line&&line<=entry.endLine);
    return item?{path:item.path,line:line-item.startLine+1,sha256:item.sha256}:null;
  }
  globalThis.sourceSetIntake=Object.freeze({SOURCE_LIMIT,MAX_FILES,PATH_LIMIT,assemble,admit,mappingFor,fromFiles,sourceLocation});
})();
