// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { SemanticElement, SemanticSnapshot, NormalizedElementKind } from '../../semantic-model/src/index.js'
import { applySourceEdits, type CommandWorkspaceDocument, type ContributorFieldCommand } from './index.js'
import { planBatchStructuredSourceEdits, planStructuredSourceEdits } from './structured-source-edits.js'
import { quantityField, referenceField, interfaceAgreementField, roundTripsNumericLiteral } from './contributor-profile.js'

const text = `package Example {
 part def Equipment;
 part def Person;
 port def Link;
 port def OtherLink;
 part system {
  attribute duration : ISQ::DurationValue = 120 [SI::milli * SI::s];
  part fieldA : Equipment;
  part fieldB : Equipment;
  part operator : Person;
  ref part selected : Equipment = fieldA;
  port sender : Link;
  port receiver : ~Link;
  port receiverB : ~Link;
  port telemetry : OtherLink;
  interface agreement connect sender to receiver {
   doc /* A historical decision is not authenticated approval. */
   attribute agreementStatus : AgreementStatus = AgreementStatus::draft;
   attribute agreementOwner : ScalarValues::String = "Initial owner";
   attribute agreementRationale : ScalarValues::String = "Open question";
   part nested { attribute agreementOwner : ScalarValues::String = "unrelated"; }
  }
  // UNRELATED advanced source remains byte-identical
  state def State { entry; then idle; state idle; }
 }
}
`
const uri = 'file:///model.sysml'
const hash = createHash('sha256').update(text).digest('hex')
const document: CommandWorkspaceDocument = { uri, workspacePath: 'model.sysml', text, sha256: hash, version: 1 }
function position(offset: number) { const prefix = text.slice(0, offset).split('\n'); return { line: prefix.length - 1, character: prefix.at(-1)!.length } }
function element(id: string, kind: NormalizedElementKind, name: string, declaration: string, ownerId?: string, end?: number): SemanticElement {
  const start = text.indexOf(declaration)
  return { id, kind, rawKind: kind, name, qualifiedName: ownerId === 'system' ? `Example::system::${name}` : `Example::${name}`, ownerId,
    fingerprint: id, source: { uri, workspacePath: 'model.sysml', documentSha256: hash, range: { start: position(start), end: position(end ?? start + declaration.length) } },
    provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-semantic-evidence', classification: 'engine-metaclass', engineId: id } }
}
const elements: SemanticElement[] = [
 element('package', 'Package', 'Example', 'package Example {', undefined, text.length - 1),
 element('equipment', 'PartDefinition', 'Equipment', 'part def Equipment;', 'package'),
 element('person', 'PartDefinition', 'Person', 'part def Person;', 'package'),
 element('link', 'PortDefinition', 'Link', 'port def Link;', 'package'),
 element('other-link', 'PortDefinition', 'OtherLink', 'port def OtherLink;', 'package'),
 element('system', 'PartUsage', 'system', 'part system {', 'package', text.lastIndexOf(' }') + 2),
 element('duration', 'AttributeUsage', 'duration', 'attribute duration : ISQ::DurationValue = 120 [SI::milli * SI::s];', 'system'),
 ...['fieldA', 'fieldB'].map((name) => element(name, 'PartUsage', name, `part ${name} : Equipment;`, 'system')),
 element('operator', 'PartUsage', 'operator', 'part operator : Person;', 'system'),
 element('selected', 'PartUsage', 'selected', 'ref part selected : Equipment = fieldA;', 'system'),
 element('sender', 'PortUsage', 'sender', 'port sender : Link;', 'system'),
 ...['receiver', 'receiverB'].map((name) => element(name, 'PortUsage', name, `port ${name} : ~Link;`, 'system')),
 element('telemetry', 'PortUsage', 'telemetry', 'port telemetry : OtherLink;', 'system'),
 element('agreement', 'InterfaceUsage', 'agreement', 'interface agreement connect sender to receiver {', 'system', text.indexOf('\n  // UNRELATED') - 0),
]
elements[0]!.qualifiedName = 'Example'
const snapshot: SemanticSnapshot = { schemaVersion: 1, snapshotSha256: 'snapshot', workspace: { id: 'workspace', rootUri: 'file:///', configurationName: 'test' },
 authority: { adapterId: 'test', adapterVersion: '1', engineName: 'test', engineVersion: '1', referenceRelease: 'test', qualificationStatus: 'qualified' }, freshness: 'current', documents: [], elements,
 relationships: [['fieldA', 'equipment'], ['fieldB', 'equipment'], ['selected', 'equipment'], ['operator', 'person'], ['sender', 'link'], ['telemetry', 'other-link']].map(([sourceId, targetId]) => ({ id: `${sourceId}-${targetId}`, kind: 'typing', sourceId: sourceId!, targetId: targetId!, provenance: { authority: 'qualified-language-engine', extraction: 'pilot-emf-explicit-reference', engineMetaclass: 'FeatureTyping', features: ['type'] } })) }
function source(id: string): string { const e=elements.find((item)=>item.id===id)!; const offset=(p:{line:number;character:number})=>text.split('\n').slice(0,p.line).reduce((sum,line)=>sum+line.length+1,0)+p.character; return text.slice(offset(e.source.range.start),offset(e.source.range.end)) }
function apply(command: ContributorFieldCommand): string { return applySourceEdits([document], planStructuredSourceEdits(command, snapshot, [document]).edits).documents[0]!.text }
const agreementCommand = { kind: 'set-interface-agreement', targetId: 'agreement', sourceId: 'sender', targetEndpointId: 'receiverB', status: 'proposed', owner: 'Interface lead', rationale: 'Requested endpoint change; question remains open.' } as const

describe('bounded contributor field profile', () => {
 it('offers only same-dimension units and changes numeric value explicitly without conversion', () => {
  expect(quantityField(elements.find((e)=>e.id==='duration')!, source('duration'))?.units.map((unit)=>unit.id)).toEqual(['s','ms'])
  expect(apply({ kind:'set-quantity-value', targetId:'duration', value:0.08, unitId:'s' })).toContain('attribute duration : ISQ::DurationValue = 0.08 [SI::s];')
  expect(()=>apply({ kind:'set-quantity-value',targetId:'duration',value:1,unitId:'kg'})).toThrow(/incompatible/)
  expect(()=>apply({ kind:'set-quantity-value',targetId:'duration',value:Infinity,unitId:'s'})).toThrow(/finite/)
  expect(()=>apply({ kind:'set-quantity-value',targetId:'duration',value:120,unitId:'ms'})).toThrow(/no changes/)
 })
 it('preserves magnitude and unit delimiter whitespace and rejects lossy source literals', () => {
  const element=elements.find((entry)=>entry.id==='duration')!
  expect(quantityField(element,source('duration').replace('120 [', '9007199254740993 ['))).toBeNull()
  expect(quantityField(element,source('duration').replace('120 [', '1e-400 ['))).toBeNull()
  for (const value of ['0.08','8e-2','80.00','+120','-0.1','.5','1e30']) expect(roundTripsNumericLiteral(value)).toBe(true)
  for (const value of ['9007199254740993','1e-400','1.0000000000000001','Infinity','1; hacked']) expect(roundTripsNumericLiteral(value)).toBe(false)
 })
 it('requires semantic type identity and source scope for references', () => {
  const field=referenceField(elements.find((e)=>e.id==='selected')!,source('selected'),snapshot,text)!
  expect(field.candidates.map((entry)=>entry.id)).toEqual(['fieldA','fieldB'])
  expect(apply({kind:'set-reference-target',targetId:'selected',referencedElementId:'fieldB'})).toContain('ref part selected : Equipment = Example::system::fieldB;')
  expect(()=>apply({kind:'set-reference-target',targetId:'selected',referencedElementId:'operator'})).toThrow(/same semantic type/)
  expect(()=>apply({kind:'set-reference-target',targetId:'selected',referencedElementId:'fieldA; attribute hacked'})).toThrow(/same semantic type/)
  const missing={...snapshot,relationships:snapshot.relationships.filter((edge)=>edge.sourceId!=='selected')}
  expect(referenceField(elements.find((e)=>e.id==='selected')!,source('selected'),missing,text)).toBeNull()
 })
 it('excludes reference chains and shadowed standard quantity namespaces', () => {
  const rewritten = text.replace('part fieldB : Equipment;', 'ref part fieldB : Equipment = selected;')
  // Use source ranges from a fresh semantic snapshot, including the changed field length.
  const fieldB = elements.find((entry)=>entry.id==='fieldB')!
  const end = {...fieldB.source.range.end, character: fieldB.source.range.end.character + 'ref part fieldB : Equipment = selected;'.length - 'part fieldB : Equipment;'.length}
  const changed = {...snapshot, elements: snapshot.elements.map((entry)=>entry.id==='fieldB' ? {...entry, source:{...entry.source,range:{start:entry.source.range.start,end}}} : entry)}
  expect(referenceField(elements.find((e)=>e.id==='selected')!,source('selected'),changed,rewritten)?.candidates.map((entry)=>entry.id)).not.toContain('fieldB')
  const shadow = {...snapshot, elements:[...snapshot.elements,{...elements[0]!,id:'shadow',name:'ISQ',qualifiedName:'Example::ISQ'}]}
  expect(quantityField(elements.find((e)=>e.id==='duration')!,source('duration'),shadow)).toBeNull()
 })
 it('rejects namespace-shadowed emitted paths and alias-bearing source rather than guessing target resolution', () => {
  const selected=elements.find((entry)=>entry.id==='selected')!
  const aliasDocument=text.replace('part fieldA', 'alias Other for Example::Equipment;\n  part fieldA')
  expect(referenceField(selected,source('selected'),snapshot,aliasDocument)).toBeNull()
  expect(quantityField(elements.find((entry)=>entry.id==='duration')!,source('duration'),snapshot,aliasDocument)).toBeNull()
  const localRoot={...elements[0]!,id:'shadow-root',name:'Example',qualifiedName:'Example::system::Example',ownerId:'system'}
  const shadow={...snapshot,elements:[...snapshot.elements,localRoot]}
  expect(referenceField(selected,source('selected'),shadow,text)).toBeNull()
 })
 it('uses source-owned conjugation and excludes incompatible or reversed endpoint choices', () => {
  const field=interfaceAgreementField(elements.find((e)=>e.id==='agreement')!,source('agreement'),snapshot,text)!
  expect(field.targetCandidates.map((entry)=>entry.id)).toEqual(['receiver','receiverB'])
  expect(field.sourceCandidates.map((entry)=>entry.id)).toEqual(['sender'])
  expect(()=>apply({...agreementCommand,targetEndpointId:'telemetry'})).toThrow(/compatible ports/)
  expect(()=>apply({...agreementCommand,targetEndpointId:'sender'})).toThrow(/compatible ports/)
  expect(interfaceAgreementField(elements.find((e)=>e.id==='agreement')!,source('agreement'),snapshot)).toBeNull()
 })
 it('records agreement source fields while preserving nested, unrelated and open-question content', () => {
  const updated=apply(agreementCommand)
  expect(updated).toContain('interface agreement connect sender to Example::system::receiverB {')
  expect(updated).toContain('AgreementStatus::proposed;')
  expect(updated).toContain('"Interface lead";')
  expect(updated).toContain('part nested { attribute agreementOwner : ScalarValues::String = "unrelated"; }')
  expect(updated).toContain('// UNRELATED advanced source remains byte-identical\n  state def State { entry; then idle; state idle; }')
  expect(updated).toContain('A historical decision is not authenticated approval.')
  expect(()=>apply({...agreementCommand,status:'agreed',owner:''})).toThrow(/owner and rationale/)
  expect(()=>apply({...agreementCommand,status:'approved' as 'agreed'})).toThrow(/Unknown recorded/)
 })
 it('rejects malformed, ambiguous and unsupported source profiles', () => {
  const e=elements.find((entry)=>entry.id==='agreement')!
  const declaration=source('agreement')
  expect(interfaceAgreementField(e,declaration.replace('attribute agreementOwner', 'attribute agreementOwner : ScalarValues::String = "duplicate"; attribute agreementOwner'),snapshot,text)).toBeNull()
  expect(quantityField(elements.find((entry)=>entry.id==='duration')!,source('duration').replace('120 [SI::milli * SI::s]', '100 + 20 [SI::s]'))).toBeNull()
  expect(referenceField(elements.find((entry)=>entry.id==='selected')!,source('selected').replace('fieldA;', 'fieldA ?? fieldB;'),snapshot,text)).toBeNull()
 })
 it('combines quantity, reference and agreement into one exact inverse without nested overlap', () => {
  const edits=planBatchStructuredSourceEdits([{kind:'set-quantity-value',targetId:'duration',value:80,unitId:'ms'}, {kind:'set-reference-target',targetId:'selected',referencedElementId:'fieldB'}, agreementCommand],snapshot,[document]).edits
  const applied=applySourceEdits([document],edits)
  expect(applied.documents[0]!.text).toContain('80 [SI::milli * SI::s]')
  expect(applySourceEdits(applied.documents,applied.inverse).documents[0]!.text).toBe(text)
  expect(()=>planBatchStructuredSourceEdits([agreementCommand,{kind:'update-documentation',targetId:'agreement',documentation:'Revised'}],snapshot,[document])).not.toThrow()
  expect(()=>planBatchStructuredSourceEdits([agreementCommand,agreementCommand],snapshot,[document])).toThrow(/overlap/)
 })
})
