"""Experimental in-browser adapter over maintained projection/workflow functions."""
def normalized(checked):
    if not checked['valid']:
        return {'source':checked['source'],'sourceSha256':hashlib.sha256(checked['source'].encode()).hexdigest(),'staticChecksPassed':False,'diagnostics':checked['diagnostics'],'elements':[],'views':[]}
    report=normalize(checked['raw'],checked['source'])
    report['source']=checked['source']
    report['diagnostics']=[dict(d,line=d.get('startLine')) for d in checked['diagnostics']]
    report['authorityLimit']='OpenSysML browser validation and analytical views; Pilot parity and engineering acceptance are not established.'
    return report

current_report=None

def render_report(data):
    global current_report
    report=normalized(data['checked'])
    if not report['staticChecksPassed']:return report
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
                behavior=behavior_project(report,target);v['svg']=behavior_svg(behavior);v['behavior']=behavior
            else:
                # Explicitly analytical. This does not claim Pilot notation parity.
                v['svg']=v['stakeholderSvg']
        except Exception as error:v['error']=str(error)
        report['views'].append(v)
    report['viewRecipes']=recipes
    report['changeSummary']=summarize(normalized(data['baseChecked']),report)
    report['reportIntegrity']={'reportSha256':hashlib.sha256(json.dumps(report,sort_keys=True).encode()).hexdigest()}
    report['catalogue']=catalogue(report)
    report['catalogue']['reportSha256']=report['reportIntegrity']['reportSha256']
    if data.get("accept"):current_report=report
    return browser_report(report)

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

def detail_current(data):return element_detail(current_report,data['request'])

def proposal_summary(data):return summarize(current_report,normalized(data["checked"]))
