from source_intake import admit_source_set

"""Experimental in-browser adapter over maintained projection/workflow functions."""
def normalized(checked):
    diagnostics=[dict(d,line=(d.get('span') or {}).get('startLine',d.get('line'))) for d in checked['diagnostics']]
    if not checked['valid']:
        return {'source':checked['source'],'sourceSha256':hashlib.sha256(checked['source'].encode()).hexdigest(),'staticChecksPassed':False,'diagnostics':diagnostics,'elements':[],'views':[]}
    report=normalize(checked['raw'],checked['source'])
    report['source']=checked['source']
    report['diagnostics']=diagnostics
    report['authorityLimit']='OpenSysML browser validation and analytical views; Pilot parity and engineering acceptance are not established.'
    return report

current_report=None
staged_report=None
previous_report=None
last_rolled_back=None

def render_report(data):
    global current_report, staged_report, previous_report, last_rolled_back
    metadata=data.get('sourceSet', None if data.get('inspection') else (current_report or {}).get('_sourceSet'))
    if metadata is not None:
        metadata=admit_source_set(metadata,data['baseChecked']['source'])['sourceSet']
    report=normalized(data['checked'])
    if not report['staticChecksPassed']:return browser_report(report,metadata)
    recipes=views_for(data['views'])
    rendered=exploration_views(recipes,data.get('target'),data.get('view','DEFAULT'))
    report['views']=[]
    for request in rendered:
        target=request['names'][0]
        v={'id':request['id'],'targets':request['names'],'view':request['view'],'styles':request.get('styles',[]),'notationProfile':'experimental-browser-analytical'}
        try:
            projection=project(report,target,request)
            v['stakeholder']=projection
            v['stakeholderSvg']=render_svg(projection)
            v['stakeholderPortraitSvg']=render_svg({**projection,'layoutDirection':'TB'})
            if request.get('renderer')=='engineering':
                drawing=interconnection(report,target);v['svg']=drawing.pop('svg');v.update(drawing)
            elif request.get('renderer')=='summary':
                drawing=exchange_summary(report,target);v['svg']=drawing.pop('svg');v.update(drawing)
            elif request['view'] in ('STATE','ACTION'):
                behavior=behavior_project(report,target);v['svg']=behavior_svg(behavior);v['behavior']=behavior;v['notationProfile']=behavior.get('profile','declared-behavior-v1')
            else:
                # Explicitly analytical. This does not claim Pilot notation parity.
                v['svg']=v['stakeholderSvg']
                v['notationProfile']='analytical-browser-overview-v1'
            v['authority']='OpenSysML API facts; shared analytical presentation'
        except Exception as error:v['error']=str(error)
        report['views'].append(v)
    report['viewRecipes']=recipes
    report['changeSummary']=summarize(normalized(data['baseChecked']),report)
    report['reportIntegrity']={'reportSha256':hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()}
    try:
        report['catalogue']=catalogue_for_views(report,rendered)
        report['catalogue']['reportSha256']=report['reportIntegrity']['reportSha256']
    except ValueError as error:
        report['catalogueError']=str(error)
    report['_sourceSet']=metadata
    if data.get('stage') or data.get('accept'):
        for v in report['views']:
            failure=v.get('error') or v.get('stakeholderError')
            if failure or not v.get('svg') or not v.get('stakeholderSvg'):
                raise ValueError('Required view '+v['id']+' could not be built: '+str(failure or 'A required audience drawing is missing')+'. Current project is retained.')
    if data.get('stage'):
        if identity(current_report) != (data.get('expectedBase'), data.get('expectedReport')):
            raise ValueError('Accepted project changed while this candidate was rendering')
        staged_report=(data['transactionId'],report,identity(current_report))
    elif data.get("accept"):
        current_report=report
        staged_report=previous_report=last_rolled_back=None
    return browser_report(report,metadata)

def minimum_options_current(data):
    if not current_report or data['request'].get('baseSourceSha256') != current_report.get('sourceSha256'):
        raise ValueError('The model changed. Reopen the editing task.')
    return {'sourceSha256':current_report['sourceSha256'],'options':minimum_edit_options(current_report)}

def prepare_candidate(data):
    old=current_report;request=data['request']
    draft,proposal=candidate(old,old['source'],request)
    views=json.loads(json.dumps(old['viewRecipes']))
    if request['operation']=='scenario':views.append(scenario_view(views,request['target'],request['name']))
    views_for(views)
    return {'source':draft,'proposal':proposal,'views':views}

def compose_current(data):
    report=data['report'];request=data['request']
    if not report or request.get('sourceSha256')!=report['sourceSha256'] or request.get('reportSha256')!=report['reportIntegrity']['reportSha256']:raise ValueError('Source revision is no longer current; validate the draft first')
    return {**compose(report['catalogue'],request.get('recipe')),'reportSha256':report['reportIntegrity']['reportSha256']}

def detail_current(data):return element_detail(current_report,data['request'],(current_report or {}).get('_sourceSet'))

def proposal_summary(data):return summarize(current_report,normalized(data["checked"]))


def identity(report):
    return ((report or {}).get('sourceSha256'), (report or {}).get('reportIntegrity',{}).get('reportSha256'))

def accept_current(data):
    global current_report, staged_report, previous_report, last_rolled_back
    if not staged_report or staged_report[0] != data.get('transactionId'):
        raise ValueError('Project transaction is no longer current')
    token,report,expected=staged_report
    if identity(current_report) != expected or identity(report) != (data.get('sourceSha256'),data.get('reportSha256')):
        raise ValueError('Project transaction does not match the staged report')
    last_rolled_back=None
    previous_report=(token,current_report)
    current_report=report
    staged_report=None
    return {'accepted':True,'transactionId':token,'sourceSha256':identity(report)[0],'reportSha256':identity(report)[1]}

def rollback_current(data):
    global current_report, staged_report, previous_report, last_rolled_back
    token=data.get('transactionId')
    if not isinstance(token,str) or not 8 <= len(token) <= 128:
        raise ValueError('Invalid project transaction identity')
    if previous_report and previous_report[0] == token:
        current_report=previous_report[1]
        previous_report=None
    elif staged_report and staged_report[0] == token:
        # The accept request may never have arrived; abort only this candidate.
        staged_report=None
    elif last_rolled_back != token:
        raise ValueError('Project acceptance can no longer be rolled back')
    # One confirmation is enough to retry a lost rollback response safely.
    last_rolled_back=token
    return {'rolledBack':True,'transactionId':token}
