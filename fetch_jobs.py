import json,urllib.request,urllib.parse,re,datetime
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'data/jobs.json';now=datetime.datetime.now(datetime.timezone.utc).isoformat();jobs=[]
def get(u):
 r=urllib.request.Request(u,headers={'User-Agent':'JobRadarPortfolio/1.0'});return json.load(urllib.request.urlopen(r,timeout=25))
try:
 d=get('https://remotive.com/api/remote-jobs?category=software-dev&search='+urllib.parse.quote('java')+'&limit=50')
 for x in d.get('jobs',[]): jobs.append({'title':x.get('title',''),'company':x.get('company_name',''),'location':x.get('candidate_required_location','Remote'),'source':'Remotive','posted':x.get('publication_date'),'collected_at':now,'url':x.get('url'),'tags':[x.get('category','')],'description':re.sub('<[^>]+>',' ',x.get('description',''))})
except Exception as e: print(e)
try:
 d=get('https://www.arbeitnow.com/api/job-board-api')
 for x in d.get('data',[]):
  t=(x.get('title','')+' '+x.get('description','')).lower()
  if any(k in t for k in ['java','spring boot','backend','microservices']): jobs.append({'title':x.get('title',''),'company':x.get('company_name',''),'location':x.get('location',''),'source':'Arbeitnow','posted':x.get('created_at') or x.get('date'),'collected_at':now,'url':x.get('url'),'tags':x.get('tags',[]),'description':re.sub('<[^>]+>',' ',x.get('description',''))})
except Exception as e: print(e)
out.write_text(json.dumps(jobs[:300],indent=2,ensure_ascii=False));print('wrote',len(jobs))