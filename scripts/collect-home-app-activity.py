#!/usr/bin/env python3
"""Pull scoped, locally queued Roblox/YouTube events. Acknowledge only after ingest."""
from __future__ import annotations
import argparse,base64,datetime as dt,gzip,hashlib,json,os,pathlib,re,shlex,subprocess,urllib.request


def powershell(script: str) -> str:
    data=base64.b64encode(gzip.compress(script.encode())).decode()
    wrapper="$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$m=New-Object IO.MemoryStream(,[Convert]::FromBase64String('"+data+"'));$g=New-Object IO.Compression.GzipStream($m,[IO.Compression.CompressionMode]::Decompress);$r=New-Object IO.StreamReader($g);& ([scriptblock]::Create($r.ReadToEnd()))"
    return 'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+base64.b64encode(wrapper.encode('utf-16le')).decode()


def ssh(args, target, script):
    cmd=['ssh','-F',args.ssh_config,'-o','BatchMode=yes','-o','ConnectTimeout=6']
    if args.jump:cmd+=['-J',args.jump]
    cmd+=[target,powershell(script)]
    result=subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8-sig',timeout=110)
    if result.returncode:raise RuntimeError(result.stderr.strip()[:300] or f'SSH exit {result.returncode}')
    return json.loads(result.stdout.strip()) if result.stdout.strip() else None


def resolve_games(events, cache):
    ids=sorted({str(e.get('metadata',{}).get('universe_id') or '') for e in events}-{''}-cache.keys())
    for offset in range(0,len(ids),100):
        batch=[x for x in ids[offset:offset+100] if x.isdigit()]
        if not batch:continue
        req=urllib.request.Request('https://games.roblox.com/v1/games?universeIds='+','.join(batch),headers={'User-Agent':'HomeActivityMonitor/2'})
        with urllib.request.urlopen(req,timeout=20) as response:data=json.load(response)
        for game in data.get('data',[]):cache[str(game['id'])]={'name':game['name'],'root_place_id':str(game['rootPlaceId'])}
    for e in events:
        game=cache.get(str(e.get('metadata',{}).get('universe_id') or ''))
        if game:
            e['title']=game['name'];e['metadata']['root_place_id']=game['root_place_id']


def post_events(url, token, events):
    for offset in range(0,len(events),500):
        req=urllib.request.Request(url,data=json.dumps({'events':events[offset:offset+500]}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
        with urllib.request.urlopen(req,timeout=30) as response:result=json.load(response)
        if result.get('ok') is not True:raise RuntimeError('Activity ingest did not acknowledge batch')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--devices',required=True);p.add_argument('--api-url',default=os.getenv('HOME_ACTIVITY_API_URL'));p.add_argument('--jump');p.add_argument('--ssh-config',default='/dev/null');p.add_argument('--install',action='store_true');p.add_argument('--dry-run',action='store_true');p.add_argument('--since-hours',type=int,default=24);p.add_argument('--state-dir',default='/var/lib/home-activity-collector')
    args=p.parse_args()
    if args.dry_run and args.install:
        devices=json.loads(pathlib.Path(args.devices).read_text())
        print(json.dumps({'dry_run':True,'planned_installations':devices,'changes_made':False}))
        return 0
    token=os.getenv('HOME_ACTIVITY_INGEST_TOKEN') or os.getenv('HOME_NETWORK_INGEST_TOKEN')
    if not args.dry_run and not args.install and (not args.api_url or not token):p.error('API URL and ingest token required')
    devices=json.loads(pathlib.Path(args.devices).read_text());agent=pathlib.Path(__file__).with_suffix('.ps1').read_text()
    state=pathlib.Path(args.state_dir)
    if not args.dry_run:state.mkdir(parents=True,exist_ok=True)
    cache_path=state/'roblox-games.json';cache=json.loads(cache_path.read_text()) if cache_path.exists() else {}
    reports=[]
    default_jump=args.jump
    for d in devices:
        args.jump=d.get("jump",default_jump)
        if not re.fullmatch('[a-z][a-z0-9-]*',d['child']):raise ValueError('Invalid child label')
        report={'child':d['child'],'device_id':d['device_id']}
        try:
            if args.install:
                prepare="$ErrorActionPreference='Stop';if($env:COMPUTERNAME -ine '"+d['device_id']+"'){throw 'Unexpected computer identity; installation refused'};New-Item -ItemType Directory -Force 'C:\\ProgramData\\HomeActivityMonitor'|Out-Null;ConvertTo-Json -InputObject @{ready=$true;hash=$(if(Test-Path 'C:\\ProgramData\\HomeActivityMonitor\\collect-home-app-activity.ps1'){(Get-FileHash 'C:\\ProgramData\\HomeActivityMonitor\\collect-home-app-activity.ps1' -Algorithm SHA256).Hash}else{''})} -Compress"
                ready=ssh(args,d['target'],prepare)
                copy=['scp','-F',args.ssh_config,'-o','BatchMode=yes','-o','ConnectTimeout=6']
                if args.jump:copy+=['-J',args.jump]
                copy+=[str(pathlib.Path(__file__).with_suffix('.ps1')),d['target']+':C:/ProgramData/HomeActivityMonitor/collect-home-app-activity.ps1']
                digest=hashlib.sha256(agent.encode()).hexdigest()
                if str(ready.get('hash','')).lower()!=digest:
                    copied=subprocess.run(copy,capture_output=True,text=True,timeout=45)
                    if copied.returncode:raise RuntimeError('Collector transfer failed: '+copied.stderr.strip()[:200])
                install="""$ErrorActionPreference='Stop';if($env:COMPUTERNAME -ine 'DEVICE'){throw 'Unexpected computer identity; installation refused'};$root='C:\\ProgramData\\HomeActivityMonitor';New-Item -ItemType Directory -Force $root | Out-Null
if((Get-FileHash ($root+'\\collect-home-app-activity.ps1') -Algorithm SHA256).Hash -ine 'DIGEST'){throw 'Collector checksum mismatch'}
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\ProgramData\\HomeActivityMonitor\\collect-home-app-activity.ps1 -Child CHILD -Persist'
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
Register-ScheduledTask -TaskName 'Home Activity Monitor' -Action $action -Trigger $trigger -Settings $settings -User SYSTEM -RunLevel Highest -Force | Out-Null
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ($root+'\\collect-home-app-activity.ps1') -Child CHILD -Persist -SinceHours HOURS
if($LASTEXITCODE -ne 0){throw 'Initial collector execution failed'}
""".replace('DEVICE',d['device_id']).replace('CHILD',d['child']).replace('HOURS',str(args.since_hours)).replace('DIGEST',digest)
                installed=ssh(args,d['target'],install)
                report['installed']=installed
                report['ok']=installed.get('ok') is True
                reports.append(report)
                continue
            fetch="""$ErrorActionPreference='Stop';$p='C:\\ProgramData\\HomeActivityMonitor\\spool';if(-not(Test-Path $p)){throw 'Local collector not installed'};$all=@(Get-ChildItem $p -Filter '*.json' -File|Sort-Object Name);$b=@();foreach($f in $all|Select-Object -First 20){$b+=@{name=$f.Name;payload=([IO.File]::ReadAllText($f.FullName)|ConvertFrom-Json)}};ConvertTo-Json -InputObject @{batches=$b;backlog_remaining=[Math]::Max(0,$all.Count-20)} -Depth 12 -Compress"""
            data=ssh(args,d['target'],fetch);events=[e for b in data['batches'] for e in b['payload']['events']]
            # Device identity is verified before records are accepted under its inventory label.
            if any(e.get('device_id','').casefold()!=d['device_id'].casefold() or e.get('child')!=d['child'] for e in events):raise RuntimeError('Configured device identity differs from collected identity')
            resolve_games(events,cache)
            if not args.dry_run:
                post_events(args.api_url,token,events)
                names=[b['name'] for b in data['batches']]
                if any(not re.fullmatch(r'[0-9]{8}T[0-9]{9}-[a-f0-9]{32}\.json',n) for n in names):raise ValueError('Unexpected spool filename; not acknowledged')
                if names:
                    ack="$ErrorActionPreference='Stop';"+';'.join("Remove-Item -LiteralPath 'C:\\ProgramData\\HomeActivityMonitor\\spool\\"+n+"'" for n in names)+";ConvertTo-Json -InputObject @{acknowledged="+str(len(names))+"} -Compress"
                    ssh(args,d['target'],ack)
            report.update(ok=True,events=len(events),backlog_remaining=data['backlog_remaining'],errors=[x for b in data['batches'] for x in b['payload'].get('errors',[])])
        except (RuntimeError,subprocess.TimeoutExpired,OSError,ValueError) as exc:
            report.update(ok=False,error=str(exc)[:400])
        reports.append(report)
    if not args.dry_run:cache_path.write_text(json.dumps(cache,ensure_ascii=False,indent=2))
    if not args.dry_run:(state/'last-run.json').write_text(json.dumps({'collected_at':dt.datetime.now(dt.timezone.utc).isoformat(),'devices':reports},indent=2))
    print(json.dumps({'devices':reports},ensure_ascii=False))
    return 1 if any(not r['ok'] for r in reports) else 0
if __name__=='__main__':raise SystemExit(main())
