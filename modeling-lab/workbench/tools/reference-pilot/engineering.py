"""Bounded SysML 2.0 part/port interconnection notation from Pilot EMF facts.

No SysML parser and no inference from labels. Unsupported endpoints are reported;
connections never become flow arrows. Reference renderer remains available.
"""
from html import escape
import hashlib
from presentation import display_name, element_order, resolve_target, part_features, multiplicity

PARTS = {'PartUsage'}
LINKS = {'InterfaceUsage', 'ConnectionUsage', 'BindingConnectorAsUsage', 'FlowUsage'}


def index_report(report):
    return {e['sessionElementId']: e for e in report['elements']}


def sem(element, field, default=None):
    return element.get('semantics', {}).get(field, default)


def features(element, index):
    # Engine resolves inheritance and redefinition; do not union definitions by name.
    return [index[r['id']] for r in sem(element, 'feature', []) if r['id'] in index]


def types(element):
    return [display_name(r, r.get('qualifiedName') or 'Unknown type') for r in (sem(element, 'type', []) or []) if isinstance(r, dict)]


def endpoint(reference, index):
    element = index.get(reference['id'])
    if element is None:
        raise ValueError('Endpoint is outside extracted source evidence')
    chain = sem(element, 'chainingFeature', [])
    if chain:
        if len(chain) != 2:
            raise ValueError('Only direct part.port chains are supported in this focused view')
        return chain[0]['id'], chain[1]['id']
    if element['metaclass'] == 'PortUsage':
        return None, element['sessionElementId']
    raise ValueError('Endpoint is not a port or direct part.port chain')


def interface_flows(connection, index):
    """Resolve declared interface flow roles through actual connector-end subsetting."""
    flows, errors = [], []
    for flow in features(connection, index):
        if flow['metaclass'] != 'FlowUsage': continue
        try:
            def actual(role):
                source = index.get(role.get('id'), role)
                chain = sem(source, 'chainingFeature', [])
                role_name = chain[0].get('name') if chain else source.get('name')
                if not isinstance(role_name, str) or not role_name:
                    raise ValueError('Interface flow role has no resolved name; no binding inferred')
                ends = [index[r['id']] for r in sem(connection,'connectorEnd',[])
                        if r['id'] in index and index[r['id']].get('name') == role_name]
                if len(ends) != 1: raise ValueError('Interface flow role is ambiguous')
                subset = index.get(sem(ends[0],'ownedReferenceSubsetting',{}).get('id'),{})
                referred = sem(subset,'referencedFeature')
                if not referred: raise ValueError('Interface end has no explicit resolved binding')
                return endpoint(referred,index)
            source = sem(flow,'sourceFeature',{})
            targets = sem(flow,'targetFeature',[])
            if len(targets)!=1: raise ValueError('Flow must have exactly one target')
            payloads=[index[r['id']] for r in sem(flow,'ownedElement',[])
                      if r['id'] in index and index[r['id']]['metaclass']=='PayloadFeature']
            if len(payloads)!=1 or len(types(payloads[0]))!=1: raise ValueError('Flow payload is not uniquely typed')
            flows.append({'elementId':flow['sessionElementId'],'source':actual(source),
                          'target':actual(targets[0]),'item':types(payloads[0])[0]})
        except (ValueError,KeyError,TypeError) as error:
            errors.append({'id':flow['sessionElementId'],'reason':str(error)})
    return flows, errors


def path_point(points, fraction):
    import math
    segments=[(a,b,math.dist(a,b)) for a,b in zip(points,points[1:])]
    distance=sum(d for _,_,d in segments)*fraction
    for a,b,d in segments:
        if distance<=d and d:
            v=((b[0]-a[0])/d,(b[1]-a[1])/d)
            return (a[0]+v[0]*distance,a[1]+v[1]*distance),v
        distance-=d
    raise ValueError('Zero-length connector path')


def interconnection(report, target):
    if not report.get('staticChecksPassed'):
        raise ValueError('A successful static validation result is required')
    index = index_report(report)
    root = resolve_target(report, target, {'PartDefinition', 'PartUsage'})
    fs = features(root, index)
    parts, collections = part_features(root, index)
    parts.sort(key=element_order)
    ports = [e for e in fs if e['metaclass'] == 'PortUsage']
    if len(parts) > 12:
        raise ValueError('Focus on a smaller scope: this sheet supports up to 12 part usages')
    if not parts and not ports and not collections:
        raise ValueError('No source-backed parts or ports in this scope')
    part_ports = {p['sessionElementId']: [e for e in features(p, index) if e['metaclass'] == 'PortUsage'] for p in parts}
    valid_endpoints = {(p['sessionElementId'], q['sessionElementId']) for p in parts for q in part_ports[p['sessionElementId']]}
    valid_endpoints.update((None, q['sessionElementId']) for q in ports)
    links, excluded = [], []
    for e in fs:
        if e['metaclass'] not in LINKS:
            continue
        try:
            if e['metaclass'] == 'FlowUsage':
                raise ValueError('Flow is retained in evidence; this sheet does not infer directed item-flow notation')
            ends = sem(e, 'relatedFeature', [])
            if len(ends) != 2:
                raise ValueError('Only binary connectors are supported')
            a, b = (endpoint(end, index) for end in ends)
            if a not in valid_endpoints or b not in valid_endpoints:
                raise ValueError('Connector crosses the visible scope or an unsupported inherited context')
            links.append((e, a, b))
        except ValueError as error:
            excluded.append({'id': e['sessionElementId'], 'name': e.get('qualifiedName'), 'reason': str(error)})
    # Order by explicit topology where possible; no direction is asserted by ordering.
    neighbours = {p['sessionElementId']: set() for p in parts}
    for _, a, b in links:
        if a[0] and b[0] and a[0] != b[0]:
            neighbours[a[0]].add(b[0]); neighbours[b[0]].add(a[0])
    ordered = []
    remaining = {p['sessionElementId']: p for p in parts}
    while remaining:
        key = min(remaining, key=lambda k: (len(neighbours[k] & remaining.keys()), element_order(remaining[k])))
        while key in remaining:
            ordered.append(remaining.pop(key))
            candidates = neighbours[key] & remaining.keys()
            if not candidates: break
            key = min(candidates, key=lambda k: element_order(remaining[k]))
    parts = ordered
    widths = {p['sessionElementId']: max(260, 9 * len(display_name(p) + ': ' + ', '.join(types(p))) + 40,
              max([9 * len(display_name(q) + ': ' + ', '.join(types(q))) + 40 for q in part_ports[p['sessionElementId']]] or [0])) for p in parts}
    positions, x = {}, 90
    max_ports = max([len(v) for v in part_ports.values()] + [1])
    box_h = max(155, 70 + 60 * max_ports)
    columns = 3 if len(parts) > 4 else max(1, len(parts))
    rows = max(1, (len(parts) + columns - 1) // columns)
    column_widths = [max((widths[p['sessionElementId']] for i,p in enumerate(parts) if i % columns == col), default=260) for col in range(columns)]
    row_gap = 140 + len(links) * 36 if rows > 1 else 0
    for i, p in enumerate(parts):
        col, row = i % columns, i // columns
        px = 90 + sum(column_widths[:col]) + col * 160
        py = 135 + row * (box_h + row_gap)
        positions[p['sessionElementId']] = (px, py, widths[p['sessionElementId']], box_h)
    width = max(600, 180 + sum(column_widths) + (columns-1)*160, len(ports) * 230 + 100)
    height = rows * box_h + (rows-1)*row_gap + 270 + max(0, len(links) - 1) * 36 + (55 + 24*len(collections) if collections else 0)
    root_box = (30, 35, width - 60, height - 90)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{width}" height="{height}" viewBox="0 0 {width} {height}" preserveAspectRatio="xMinYMin meet"><rect width="100%" height="100%" fill="white"/>']
    marks = []
    def link_open(e, context):
        locator = e.get('qualifiedName') or ('anonymous:' + e['metaclass'] + ':' + str(e.get('line','')) + ':' + ' '.join(e.get('source','').split()))
        key = hashlib.sha256((target + '|' + context + '|' + locator).encode()).hexdigest()[:20]
        marks.append({'presentationId': key, 'elementId': e['sessionElementId'], 'usageContext': context, 'semanticLocator': locator})
        return f'<a xlink:href="psysml:{escape(e["sessionElementId"])}" data-presentation-id="{key}"><title>{escape(e.get("qualifiedName") or display_name(e))}</title>'
    def text(x, y, content, anchor='start', size=14):
        return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="Arial,sans-serif" font-size="{size}" fill="#17242e" stroke="white" stroke-width="4" paint-order="stroke">{escape(content)}</text>'
    def box(e, rect, context):
        x, y, w, h = rect
        definition = e['metaclass'] == 'PartDefinition'
        composite = sem(e, 'isComposite', False) in (True, 'true')
        dash = '' if definition or composite else ' stroke-dasharray="7 4"'
        label = display_name(e) + (multiplicity(e, index)[0] if e['metaclass'] == 'PartUsage' else '') + ((': ' + ', '.join(types(e))) if types(e) else '')
        svg.extend([link_open(e, context), f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{0 if definition else 12}" fill="white" stroke="#263945" stroke-width="1.5"{dash}/>', text(x+w/2,y+22,'«part def»' if definition else '«part»','middle',12).replace('<text ', '<text data-component-kind="true" '), text(x+w/2,y+43,label,'middle').replace('<text ', '<text data-component-label="true" data-overview-label="'+escape(display_name(e), quote=True)+'" data-full-label="'+escape(label, quote=True)+'" data-label-width="'+str(w*.9)+'" '), f'<path d="M{x} {y+54}H{x+w}" fill="none" stroke="#263945"/>', '</a>'])
    box(root, root_box, target)
    for p in parts: box(p, positions[p['sessionElementId']], target + '/' + display_name(p))
    docks = {}
    for p in parts:
        pid = p['sessionElementId']; px, py, pw, ph = positions[pid]
        pps = sorted(part_ports[pid], key=element_order)
        for n, port in enumerate(pps):
            key = (pid, port['sessionElementId'])
            peers = [b if a == key else a for _,a,b in links if key in (a,b)]
            right = not peers or any(peer[0] is None or positions[peer[0]][0] > px for peer in peers)
            dx = px + pw if right else px; dy = py + 88 + n*60
            docks[key] = (dx,dy,right)
            svg.extend([link_open(port,target+'/'+display_name(p)), f'<rect x="{dx-6}" y="{dy-6}" width="12" height="12" fill="white" stroke="#263945" stroke-width="1.5"/>', text(dx-14 if right else dx+14,dy-14,display_name(port)+': '+', '.join(types(port)), 'end' if right else 'start'), '</a>'])
    for n,port in enumerate(sorted(ports,key=element_order)):
        dx = 90 + n*230; dy = root_box[1]+root_box[3]
        docks[(None,port['sessionElementId'])] = (dx,dy,False)
        svg.extend([link_open(port,target),f'<rect x="{dx-6}" y="{dy-6}" width="12" height="12" fill="white" stroke="#263945" stroke-width="1.5"/>',text(dx+14,dy-12,display_name(port)+': '+', '.join(types(port))),'</a>'])
    paths=[]; flow_marks=[]; parallel_seen={}
    for n,(e,a,b) in enumerate(links):
        ax,ay,ar=docks[a]; bx,by,br=docks[b]
        ax += (6 if ar else -6) if a[0] else 0
        bx += (6 if br else -6) if b[0] else 0
        parallel_key=tuple(sorted((str(a),str(b))))
        parallel=parallel_seen.get(parallel_key,0);parallel_seen[parallel_key]=parallel+1
        if a[0] and b[0] and positions[a[0]][1] != positions[b[0]][1]:
            route_y = max(positions[a[0]][1], positions[b[0]][1]) + box_h + 44 + n*36
            sx, ex = ax+(30 if ar else -30), bx+(30 if br else -30)
            points=[(ax,ay),(sx,ay),(sx,route_y),(ex,route_y),(ex,by),(bx,by)]
            tx,ty=(sx+ex)/2,route_y-9
        elif parallel and a[0] and b[0] and abs(ax-bx)>=100:
            sign=1 if bx>ax else -1; offset=parallel*44
            points=[(ax,ay),(ax+20*sign,ay),(ax+20*sign,ay+offset),(bx-20*sign,by+offset),(bx-20*sign,by),(bx,by)]
            tx,ty=(ax+bx)/2,max(ay,by)+offset+24
        elif a[0] is None or b[0] is None or a[0]==b[0] or abs(ax-bx)<100:
            route_y=max([positions[k][1]+box_h for k in (a[0],b[0]) if k] or [135+box_h])+44+n*36
            points=[(ax,ay),(ax+(30 if ar else -30),ay),(ax+(30 if ar else -30),route_y),(bx,route_y),(bx,by)]
            tx,ty=(ax+bx)/2,route_y-9
        else:
            mid=(ax+bx)/2
            points=[(ax,ay),(mid,ay),(mid,by),(bx,by)]
            tx,ty=mid,max(ay,by)+26+n*18
        path='M'+' L'.join(f'{px},{py}' for px,py in points)
        binding=e['metaclass']=='BindingConnectorAsUsage'
        label='=' if binding else display_name(e) + ((': '+', '.join(types(e))) if types(e) else '')
        label_lines = [label] if binding else [display_name(e, 'Unnamed connection'), ', '.join(types(e))]
        svg.extend([link_open(e,target),f'<path d="{path}" fill="none" stroke="#263945" stroke-width="{1.5 if binding else 2.5}"/>'])
        svg.extend(text(tx,ty+i*16,line,'middle',12) for i,line in enumerate(label_lines) if line)
        svg.append('</a>')
        flow_specs, flow_errors = interface_flows(e,index) if e['metaclass']=='InterfaceUsage' else ([],[])
        excluded.extend(flow_errors)
        for flow_n,flow in enumerate(flow_specs):
            if {flow['source'],flow['target']} != {a,b} or a==b:
                excluded.append({'id':flow['elementId'],'reason':'Flow endpoints do not match this binary connection'})
                continue
            point,vector=path_point(points,(flow_n+1)/(len(flow_specs)+1))
            if flow['source']!=a: vector=(-vector[0],-vector[1])
            px,py=point;vx,vy=vector
            tip=(px+8*vx,py+8*vy);base=(px-6*vx,py-6*vy)
            triangle=[tip,(base[0]-6*vy,base[1]+6*vx),(base[0]+6*vy,base[1]-6*vx)]
            flow_element=index[flow['elementId']]
            svg.extend([link_open(flow_element,target+'/'+display_name(e)),
                '<polygon points="'+' '.join(f'{x},{y}' for x,y in triangle)+'" fill="#263945"/>',
                text(px,py-40,'«flow»','middle',12),text(px,py-24,flow['item'],'middle',12),'</a>'])
            flow_marks.append(dict(flow,source=list(flow['source']),target=list(flow['target']),connectionId=e['sessionElementId']))
        paths.append({'elementId':e['sessionElementId'],'endpoints':[list(a),list(b)],'points':points,'kind':e['metaclass']})
    for n, collection in enumerate(collections):
        feature = index[collection['elementId']]
        detail = ', '.join(collection['memberNames']) if collection['memberNames'] else collection['reason']
        label = 'Collection feature · ' + collection['name'] + ' ' + collection['multiplicity'] + ' · ' + detail
        svg.extend([link_open(feature, target + '/collection'), text(50, height-55-24*(len(collections)-n-1), label), '</a>'])
    svg.extend([text(30,height-15,f'SysML 2.0 part/port profile · {len(parts)} component usages · {len(collections)} collection features · {len(links)} connectors · {len(flow_marks)} flows · {len(excluded)} unsupported relations reported',size=11),'</svg>'])
    return {'svg': ''.join(svg), 'notationProfile':'sysml-2.0-parts-ports-binary-connectors-v1',
            'authority':'Pilot EMF facts; custom presentation', 'marks':marks,'connectors':paths,
            'flows':flow_marks,'collections':collections,'excluded':excluded,'partBounds':positions,'layoutRows':rows,'layoutColumns':columns,'sourceUnchanged':True,
            'limits':['Direct part.port chains and explicitly resolved flows on binary typed interfaces; no behavioral equivalence claim',
                      'Inherited library features excluded; source-defined inherited ports included']}


def exchange_summary(report, target):
    """Analytical port reduction; every edge retains original flow/connection identities."""
    detailed=interconnection(report,target);index=index_report(report)
    groups={}
    for flow in detailed['flows']:
        a,b=flow['source'][0],flow['target'][0]
        key=(a,b,flow['item'])
        group=groups.setdefault(key,{'sources':[],'connections':[],'source':a,'target':b,'item':flow['item']})
        group['sources'].append(flow['elementId']);group['connections'].append(flow['connectionId'])
    visible=set(v for k in groups for v in k[:2]);ordered=sorted(visible,key=lambda x:element_order(index[x]) if x else ('', '', -1, ''))
    width=max(620,len(ordered)*290+100);height=300+len(groups)*65
    positions={node:(60+i*290,80) for i,node in enumerate(ordered)}
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{width}" height="{height}" viewBox="0 0 {width} {height}" preserveAspectRatio="xMinYMin meet"><rect width="100%" height="100%" fill="white"/><defs><marker id="summary-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#49667b"/></marker></defs>']
    def txt(x,y,s):return f'<text x="{x}" y="{y}" font-family="Arial,sans-serif" font-size="14" fill="#234052">{escape(s)}</text>'
    svg.append(txt(30,30,'Analytical exchange summary · '+target))
    svg.append(txt(30,53,'Ports hidden; arrows summarize explicit flows. No direct connection is asserted.'))
    for node,(x,y) in positions.items():
        label=display_name(index[node]) if node else 'System boundary'
        eid=node or resolve_target(report, target)['sessionElementId']
        svg.extend([f'<a xlink:href="psysml:{escape(eid)}"><rect x="{x}" y="{y}" width="220" height="70" rx="6" fill="#f5f8fa" stroke="#49667b"/>',txt(x+15,y+30,label),txt(x+15,y+51,', '.join(types(index[node])) if node else target.split('::')[-1]),'</a>'])
    for n,group in enumerate(groups.values()):
        ax,ay=positions[group['source']];bx,by=positions[group['target']];ax+=110;bx+=110;ay+=70;by+=70
        lane=200+n*65
        if ax==bx:
            path=f'M{ax},{ay}L{ax+80},{ay+25}L{ax+80},{lane}L{ax},{lane}L{ax},{by}'
        else:path=f'M{ax},{ay}V{lane}H{bx}V{by}'
        svg.extend([f'<a xlink:href="psysml:{escape(group["sources"][0])}"><path d="{path}" fill="none" stroke="#49667b" stroke-dasharray="5 4" marker-end="url(#summary-arrow)"/>',txt(min(ax,bx)+12,lane-12,group['item']+f' · {len(group["sources"])} flow(s)'),'</a>'])
    included={c for g in groups.values() for c in g['connections']}
    omitted=[{'id':c['elementId'],'reason':'Not an explicit item exchange; omitted from this concern'} for c in detailed['connectors'] if c['elementId'] not in included]
    svg.extend([txt(30,height-24,f'{len(groups)} summary edges · {len(omitted)} non-exchange connectors omitted'),'</svg>'])
    return {'svg':''.join(svg),'notationProfile':'analytical-exchange-summary-v1','authority':'Derived aggregation over explicit Pilot flows',
            'groups':list(groups.values()),'excluded':detailed['excluded']+omitted,'sourceUnchanged':True,
            'limits':['No behavioral equivalence or newly modeled direct connection','Only detailed-profile-supported explicit flows are summarized']}
