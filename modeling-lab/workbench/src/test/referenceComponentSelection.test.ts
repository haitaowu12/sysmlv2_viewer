// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => vi.unstubAllGlobals())
const sourceSha256='a'.repeat(64), reportSha256='b'.repeat(64)
const nodes=[
  {key:'Plant',root:'Plant',parent:null,name:'Plant',elementId:'plant'},
  {key:'Plant/feedPump',root:'Plant',parent:'Plant',name:'feedPump',elementId:'pump'},
  {key:'Plant/tank',root:'Plant',parent:'Plant',name:'tank',elementId:'tank'},
]
const svg='<svg xmlns="http://www.w3.org/2000/svg"><text>ORIGINAL DIAGRAM</text></svg>'
const flush=async()=>{for(let i=0;i<64;i++)await Promise.resolve()}
const click=(label:string)=>document.querySelector<HTMLButtonElement>('[aria-label="'+label+'"]')!.click()
async function harness(metaclass='PartUsage'){
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('requestAnimationFrame',()=>0)
  delete (window as any).labWorkflow;delete (window as any).scopeWorkbench;localStorage.clear()
  const html=readFileSync('tools/reference-pilot/lab.html','utf8');document.documentElement.innerHTML=html
  window.HTMLDialogElement.prototype.close=function(){this.open=false}
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
  const composed:any[]=[]
  vi.stubGlobal('fetch',async(url:string,options?:{body:string})=>{
    const payload=options?JSON.parse(options.body):{};let data:any
    if(url==='/initial')data={source:'model',presets:[{id:'context',names:['Plant'],view:'TREE',styles:[]}]}
    else if(url==='/accept')data={accepted:true,...payload}
    else if(url==='/compose'){
      composed.push(payload.recipe)
      data={sourceSha256,reportSha256,nodes:nodes.filter(n=>n.key===payload.recipe.focus),relations:[],crossing:[],warnings:[],hiddenCount:2,filteredRelations:0,svg:'<svg xmlns="http://www.w3.org/2000/svg"><text>COMPONENT DIAGRAM</text></svg>',graphSources:{}}
    }else data={source:payload.source,transactionId:payload.transactionId,sourceSha256,reportIntegrity:{status:'verified-managed',reportSha256},staticChecksPassed:true,viewRecipes:[{id:'context',names:['Plant'],view:'TREE',styles:[]}],diagnostics:[],elements:nodes.map(n=>({sessionElementId:n.elementId,qualifiedName:n.key.replaceAll('/','::'),name:n.name,metaclass,line:1,source:'part '+n.name+';'})),views:[{id:'context',targets:['Plant'],view:'TREE',svg,stakeholderSvg:svg}],catalogue:{roots:['Plant'],nodes,warnings:[],requirements:[],traces:[],limits:{}}}
    return{json:async()=>data}
  })
  new Function(html.match(/<script nonce="__TOKEN__">([\s\S]*?)<\/script>/)![1]!+'\n'+readFileSync('tools/reference-pilot/scope.js','utf8'))()
  await flush();return{composed}
}
function findComponent(name:string){const input=document.getElementById('model-search') as HTMLInputElement;input.value=name;input.dispatchEvent(new Event('input'))}
describe('component selection and explicit view navigation',()=>{
  it('inspects a selected search result without replacing the current drawing or creating a view',async()=>{
    const h=await harness();findComponent('feed pump');click('Select Plant/feedPump');await flush()
    expect(h.composed).toHaveLength(0)
    expect(document.getElementById('canvas')!.textContent).toContain('ORIGINAL DIAGRAM')
    expect(document.getElementById('selected')!.textContent).toBe('Feed Pump')
    expect(document.querySelector('[aria-label="Select Plant/feedPump"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(document.getElementById('model-selection-actions')!.textContent).toContain('Selected · Plant / Feed Pump')
    expect(document.getElementById('model-open-component-view')).not.toBeNull()
    expect((window as any).scopeWorkbench.export()).toEqual([])
  })
  it('opens an explicit fresh component diagram and keeps the previous saved recipe intact',async()=>{
    const h=await harness()
    const prior={schemaVersion:1,root:'Plant',focus:'Plant',depth:3,neighbors:2,kinds:['binding'],pinned:['Plant/tank'],hidden:['Plant/feedPump']}
    ;(window as any).scopeWorkbench.import([{name:'Saved register',recipe:prior,surface:'register'}])
    document.querySelector<HTMLButtonElement>('[data-custom="Saved register"]')!.click();await flush()
    findComponent('feedPump');click('Select Plant/feedPump');await flush()
    expect(h.composed).toHaveLength(1)
    document.getElementById('model-open-component-view')!.click();await flush()
    expect(h.composed[1]).toEqual({schemaVersion:1,root:'Plant',focus:'Plant/feedPump',depth:1,neighbors:0,kinds:['connection','binding','flow'],pinned:[],hidden:[]})
    expect(document.querySelector('[data-surface="diagram"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(document.getElementById('inspector')!.hidden).toBe(true)
    expect((window as any).scopeWorkbench.export()).toHaveLength(1)
    expect((window as any).scopeWorkbench.export()[0]).toMatchObject({name:'Saved register',recipe:prior,surface:'register'})
    const back=Array.from(document.querySelectorAll<HTMLButtonElement>('#scope-trail button')).find(b=>b.textContent==='Back to previous scope')!
    back.click();await flush()
    expect(h.composed[2]).toEqual(prior)
    expect(document.querySelector('[data-surface="register"]')!.getAttribute('aria-pressed')).toBe('true')
    document.querySelector<HTMLButtonElement>('[data-view-index="0"]')!.click()
    expect(document.querySelector('#model-tree [aria-current]')).toBeNull()
    expect(document.querySelector('[aria-label="Select Plant/feedPump"]')!.getAttribute('aria-pressed')).toBe('true')
  })
  it('clears the navigation action when the source becomes an unvalidated draft',async()=>{
    const h=await harness();findComponent('tank');click('Select Plant/tank');await flush()
    const source=document.getElementById('source') as HTMLTextAreaElement;source.value='changed';source.dispatchEvent(new Event('input'))
    expect(document.getElementById('model-open-component-view')).toBeNull()
    expect(document.getElementById('model-tree')!.textContent).toBe('')
    expect(h.composed).toHaveLength(0)
  })
  it('offers the explicit SysML sheet seam for the selected qualified part without reusing custom filters',async()=>{
    const h=await harness();const open=vi.fn();(window as any).openSysmlComponent=open
    findComponent('feedPump');click('Select Plant/feedPump');await flush()
    const sheet=document.getElementById('model-open-sysml-sheet') as HTMLButtonElement
    expect(sheet.disabled).toBe(false)
    expect(sheet.title).toBe('Selected element and its direct features; custom scope filters do not apply.')
    sheet.click();expect(open).toHaveBeenCalledWith('Plant::feedPump');expect(h.composed).toHaveLength(0)
  })
  it('restores the exact analytical context after a core sheet and refuses stale or absent scopes',async()=>{
    const h=await harness(),workbench=(window as any).scopeWorkbench
    const prior={schemaVersion:1,root:'Plant',focus:'Plant',depth:2,neighbors:1,kinds:['flow'],pinned:['Plant/tank'],hidden:[]}
    workbench.import([{name:'Flow register',recipe:prior,surface:'register'}])
    document.querySelector<HTMLButtonElement>('[data-custom="Flow register"]')!.click();await flush()
    expect(document.getElementById('view-notation')!.textContent).toBe('Analytical table')
    const context=workbench.captureContext()
    document.querySelector<HTMLButtonElement>('[data-view-index="0"]')!.click()
    expect(workbench.active()).toBe(false)
    expect(workbench.returnToScope({...context,sourceSha256:'c'.repeat(64)})).toBe(false)
    expect(workbench.returnToScope({...context,recipe:{...prior,focus:'Plant/missing'}})).toBe(false)
    expect(h.composed).toHaveLength(1)
    expect(workbench.returnToScope(context)).toBe(true);await flush()
    expect(h.composed[1]).toEqual(prior)
    expect(document.getElementById('view-title')!.textContent).toBe('Flow register')
    expect(document.querySelector('[data-surface="register"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(workbench.export()).toHaveLength(1)
  })

  it('keeps the part/port action unavailable for other model element kinds',async()=>{
    await harness('ActionDefinition');findComponent('feedPump');click('Select Plant/feedPump');await flush()
    expect(document.getElementById('model-open-sysml-sheet')).toBeNull()
  })

})
