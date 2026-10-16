/** Render through the public SDK against the accepted source revision only. */
export async function renderAcceptedDiagram(connection, accepted, request) {
 const report=accepted();
 if(!report?.staticChecksPassed||!report.sourceSha256)throw Error('Open and validate a model before drawing it.');
 if(!request||request.sourceSha256!==report.sourceSha256)throw Error('This drawing belongs to an older model revision. Reopen the view.');
 if(typeof request.view!=='string'||!request.view.trim()||request.view.length>4096)throw Error('Choose a model view or a qualified model target.');
 const ports=request.ports??'full';
 if(!['full','minimal'].includes(ports))throw Error('Port display must be full or minimal.');
 // Reload the accepted source: prior inspections or staged changes may evict the
 // SDK handle. A candidate source is never a diagram's semantic authority.
 const source=report.source,sourceSha256=report.sourceSha256;
 const model=await connection.loads(source,{strictConformance:true});
 if(model.hasErrors)throw Error('The accepted source no longer passes engine validation.');
 const graph=await model.renderView(request.view,{ports});
 if(accepted()!==report||accepted()?.sourceSha256!==sourceSha256)throw Error('The model changed while the drawing was prepared. Reopen the view.');
 return {sourceSha256,graph};
}

/** Candidate admission evidence. This never accepts a model or supplies a drawing. */
export function engineViewQuery(request){
 if(!request||!Array.isArray(request.names)||request.names.length!==1||typeof request.names[0]!=='string')return null;
 const kind=String(request.view||'').toLowerCase();
 const eligible=(request.renderer==='engineering'&&['tree','interconnection'].includes(kind))||
  (['state','action'].includes(kind)&&(request.renderer==='behavior'||request.id==='focused'));
 return eligible?'#'+kind+':'+request.names[0]:null;
}
export async function preflightEngineViews(model,source,requests){
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
 const sourceSha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
 const receipts={};
 for(const request of requests){
  const viewquery=engineViewQuery(request);if(!viewquery)continue;
  const expectedKind=viewquery.slice(1,viewquery.indexOf(':'));
  const evidence={supported:false,sourceSha256,viewquery,kind:expectedKind,nodeCount:0,rowCount:0,edgeCount:0};
  try{
   if(model.hasErrors)throw Error('Candidate source did not pass engine validation.');
   const graph=await model.renderView(viewquery,{ports:'full'});
   const nodeCount=Array.isArray(graph.nodes)?graph.nodes.length:0,rowCount=Array.isArray(graph.rows)?graph.rows.length:0;
   Object.assign(evidence,{kind:graph.kind,nodeCount,rowCount,edgeCount:Array.isArray(graph.edges)?graph.edges.length:0});
   evidence.supported=graph.kind===expectedKind&&nodeCount+rowCount>0;
   if(!evidence.supported)evidence.error='The engine returned no content for the requested diagram kind.';
  }catch(error){evidence.error=error.message||String(error)}
  receipts[request.id]=evidence;
 }
 return receipts;
}
