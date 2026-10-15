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
        s['ownedElement']=[reference({'@id':child_id}) for child_id in children_by_owner.get(e['@id'], [])]
        if e['@type'] in ['OperatorExpression','FeatureChainExpression'] and 'argument' in s:s['operand']=s['argument']
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
