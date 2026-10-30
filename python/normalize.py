import hashlib

def normalize(raw, source):
    lines=source.splitlines(keepends=True)
    if not isinstance(raw, list):
        raise ValueError('Expected an engine element array')
    ix = {}
    children_by_owner = {}
    for e in raw:
        if (not isinstance(e, dict) or not isinstance(e.get('@id'), str)
                or not e['@id'] or not isinstance(e.get('@type'), str) or not e['@type']):
            raise ValueError('Engine element requires nonempty string @id and @type')
        if e['@id'] in ix:
            raise ValueError('Duplicate engine element identity: ' + e['@id'])
        ix[e['@id']] = e
        owner = e.get('owner')
        if owner is not None:
            if not isinstance(owner, dict) or not isinstance(owner.get('@id'), str):
                raise ValueError('Engine owner requires an @id reference')
            children_by_owner.setdefault(owner['@id'], []).append(e['@id'])
    def reference(value):
        if isinstance(value,list): return [reference(v) for v in value]
        if isinstance(value,dict) and '@id' in value:
            target=ix.get(value['@id'],{})
            return {'id':value['@id'],'qualifiedName':target.get('qualifiedName'),'name':target.get('declaredName'),'metaclass':target.get('@type')}
        return value
    es=[]
    for e in raw:
        s={k:reference(v) for k,v in e.items() if not k.startswith(('@','sysx:'))}
        if 'lab:subjectChain' in e:
            s['satisfyingFeatureChain'] = reference(e['lab:subjectChain'])
        s['ownedElement']=[reference({'@id':child_id}) for child_id in children_by_owner.get(e['@id'], [])]
        if e['@type'] in ['OperatorExpression','FeatureChainExpression'] and 'argument' in s:s['operand']=s['argument']
        # The browser producer exports typed lower/upper references separately;
        # retain those fields and bridge the maintained bound-list representation.
        if e['@type']=='MultiplicityRange' and 'bound' not in s and isinstance(e.get('upperBound'),dict):
            bound_fields=['lowerBound','upperBound'] if 'lowerBound' in e else ['upperBound']
            if all(isinstance(e.get(field,{}).get('@id'),str) and e[field]['@id'] in ix for field in bound_fields):
                s['bound']=[reference(e[field]) for field in bound_fields]
        start,end=e.get('sysx:sourceLine'),e.get('sysx:sourceEndLine')
        text=e.get('sysx:sourceText','')
        if start and end:
            # Engine positions are byte columns, one-based and end-exclusive.
            chunks=lines[start-1:end]
            if len(chunks)==1: text=chunks[0].encode()[e['sysx:sourceColumn']-1:e['sysx:sourceEndColumn']-1].decode()
            elif chunks: text=chunks[0].encode()[e['sysx:sourceColumn']-1:].decode()+''.join(chunks[1:-1])+chunks[-1].encode()[:e['sysx:sourceEndColumn']-1].decode()
        es.append({'sessionElementId':e['@id'],'metaclass':e['@type'],'qualifiedName':e.get('qualifiedName'),'name':e.get('declaredName') or e.get('lab:roleName'),'line':start,'endLine':end,'source':text,'semantics':s})
    # Materialize binary endpoints only through explicit engine-exported end bindings.
    normalized={e['sessionElementId']:e for e in es}
    # The engine's typed documentation association and the document's owner
    # jointly establish this inverse; owner alone never supplies the relation.
    for raw_element in raw:
        for ref in raw_element.get('documentation', []):
            doc=ix.get(ref.get('@id'),{}) if isinstance(ref,dict) else {}
            if (doc.get('@type') == 'Documentation' and doc.get('owner',{}).get('@id') == raw_element['@id']
                    and ('documentedElement' not in doc or doc['documentedElement'] == {'@id':raw_element['@id']})):
                normalized[doc['@id']]['semantics']['documentedElement']=reference({'@id':raw_element['@id']})
    # Prefer the explicit typing relationship over the exporter's aggregate
    # base type for conjugated ports; keep the original report identities.
    for raw_element in raw:
        e = normalized[raw_element['@id']]
        typings = raw_element.get('ownedTyping', [])
        if isinstance(typings,dict): typings=[typings]
        resolved = [ix.get(r.get('@id'),{}) for r in typings if isinstance(r,dict)]
        if resolved and all(t.get('@type') in {'FeatureTyping','ConjugatedPortTyping'}
                            and isinstance(t.get('type'),dict) and t['type'].get('@id') in ix for t in resolved):
            e['semantics']['type'] = [reference(t['type']) for t in resolved]
        # An unnamed redefinition can have a readable effective name without
        # replacing its engine qualified name or inventing an element identity.
        if raw_element['@type'] in {'AttributeUsage','PartUsage','PortUsage'} and not e.get('name'):
            redefinitions = raw_element.get('ownedRedefinition', [])
            if isinstance(redefinitions,dict): redefinitions=[redefinitions]
            targets=[]; complete=bool(redefinitions)
            for ref in redefinitions:
                rel=ix.get(ref.get('@id'),{}) if isinstance(ref,dict) else {}
                if rel.get('@type') != 'Redefinition' or rel.get('redefiningFeature',{}).get('@id') != raw_element['@id']:
                    complete=False; continue
                target=ix.get(rel.get('redefinedFeature',{}).get('@id'),{})
                if target.get('declaredName'): targets.append(target)
                else: complete=False
            names={t['declaredName'] for t in targets}
            unique_target=len({t['@id'] for t in targets})==1
            if complete and len(names)==1 and (raw_element['@type']=='AttributeUsage' or unique_target):
                e['name']=next(iter(names))
                e['semantics']['effectiveName']=e['name']
                e['semantics']['effectiveNameEvidence']=[reference({'@id':t['@id']}) for t in targets]
        if raw_element['@type'] == 'RequirementVerificationMembership':
            member=ix.get(raw_element.get('memberElement',{}).get('@id'),{})
            if (member.get('owningMembership',{}).get('@id') == raw_element['@id']
                    and member.get('verifiedRequirement')):
                e['semantics']['verifiedRequirement']=reference(member['verifiedRequirement'])
    # State subaction ownership stays with its typed membership. A bare entry
    # declaration is a source witness, not an invented ActionUsage.
    for raw_element in raw:
        if raw_element['@type'] != 'StateSubactionMembership': continue
        membership = normalized[raw_element['@id']]
        owner = normalized.get(raw_element.get('owner', {}).get('@id'))
        kind = raw_element.get('kind')
        if not owner or owner['metaclass'] not in {'StateDefinition','StateUsage','ExhibitStateUsage'} or kind not in {'entry','do','exit'}: continue
        if kind == 'entry':
            owner['semantics'].setdefault('entryDeclaration', []).append(reference({'@id':raw_element['@id']}))
        members = raw_element.get('ownedRelatedElement', [])
        if not isinstance(members, list): members = [members]
        else: members = list(members)
        for field in ('memberElement','ownedMemberElement'):
            if isinstance(raw_element.get(field),dict): members.append(raw_element[field])
        actions = []
        for member in members:
            action = normalized.get(member.get('@id')) if isinstance(member,dict) else None
            if action and action['metaclass'].endswith('ActionUsage') and member['@id'] not in [v['id'] for v in actions]:
                actions.append(reference(member))
        if actions: owner['semantics'].setdefault(kind+'Action', []).extend(actions)
    for raw_element in raw:
        if raw_element['@type'] != 'SuccessionAsUsage': continue
        source_ref = raw_element.get('sysx:sourceMember', {})
        source_membership = ix.get(source_ref.get('@id')) if isinstance(source_ref,dict) else None
        target_refs = raw_element.get('targetFeature')
        if (source_membership and source_membership['@type'] == 'StateSubactionMembership'
                and source_membership.get('kind') == 'entry'
                and source_membership.get('owner') == raw_element.get('owner')
                and isinstance(target_refs,list) and len(target_refs)==1
                and ix.get(target_refs[0].get('@id'),{}).get('@type') in {'StateUsage','ExhibitStateUsage'}):
            normalized[raw_element['@id']]['semantics'].update(source=reference(source_ref),target=reference(target_refs))
    for e in es:
        if e['metaclass'] not in {'InterfaceUsage','ConnectionUsage','BindingConnectorAsUsage','FlowUsage'}: continue
        ends=e['semantics'].get('connectorEnd',[])
        refs=[]
        for end in ends:
            actual=normalized.get(end['id'],{}).get('semantics',{})
            subset=normalized.get(actual.get('ownedReferenceSubsetting',{}).get('id'),{}).get('semantics',{})
            referred=subset.get('referencedFeature')
            if not referred: break
            refs.append(referred)
        if len(refs)==len(ends)==2:
            e['semantics']['relatedFeature']=refs
            if e['metaclass']=='FlowUsage':
                e['semantics']['sourceFeature']=refs[0]
                e['semantics']['targetFeature']=[refs[1]]
    return {'profile':'experimental-opensysml-api-json-adapter','staticChecksPassed':True,'sourceSha256':hashlib.sha256(source.encode()).hexdigest(),'elements':es,'views':[],'execution':'not-evaluated'}
