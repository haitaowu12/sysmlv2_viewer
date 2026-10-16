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
