#!/usr/bin/env python3
"""Enroll approved Windows monitors; completed devices upload independently."""
import argparse,concurrent.futures,hashlib,importlib.util,ipaddress,json,pathlib,subprocess,sys
p=pathlib.Path(__file__).with_name('collect-home-app-activity.py');spec=importlib.util.spec_from_file_location('collector',p);collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
ENROLL=r'''$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$data=[Console]::In.ReadToEnd()|ConvertFrom-Json
if($env:COMPUTERNAME -cne $data.device_id){throw 'Wrong computer identity'}
$root='C:\ProgramData\HomeActivityMonitor';$script=Join-Path $root 'collect-home-app-activity.ps1'
if(-not(Test-Path $script)){throw 'Collector script is missing'}
if((Get-FileHash $script -Algorithm SHA256).Hash -ine $data.script_hash){throw 'Installed collector differs from release'}
$task=Get-ScheduledTask -TaskName 'Home Activity Monitor';if($task.Principal.UserId -notin @('SYSTEM','S-1-5-18')){throw 'Collector task does not run as SYSTEM'}
$dest=Join-Path $root 'upload.pending';[IO.File]::WriteAllText($dest,'')
$acl=New-Object Security.AccessControl.FileSecurity;$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-18','S-1-5-32-544')){$identity=New-Object Security.Principal.SecurityIdentifier($sid);$rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','Allow');$acl.AddAccessRule($rule)}
Set-Acl -LiteralPath $dest -AclObject $acl
[IO.File]::WriteAllText($dest,(@{url=$data.url;key=$data.key}|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
Move-Item -LiteralPath $dest -Destination (Join-Path $root 'upload.json') -Force
Start-ScheduledTask -TaskName 'Home Activity Monitor'
@{device_id=$env:COMPUTERNAME;enrolled=$true;task_state=(Get-ScheduledTask -TaskName 'Home Activity Monitor').State.ToString()}|ConvertTo-Json -Compress
'''
def resolve_device_addresses(devices, snapshot):
 """Use the existing router inventory; verify the computer again over SSH."""
 resolved=[]
 for original in devices:
  device=dict(original);device['device_id']=device['device_id'].upper()
  for client in snapshot.get('clients',[]):
   if not device.get('mac') or str(client.get('mac','')).lower()!=device['mac'].lower():continue
   try:address=ipaddress.IPv4Address(client.get('ip',''))
   except ipaddress.AddressValueError:continue
   if not address.is_private:continue
   device['target']=device['target'].split('@',1)[0]+'@'+str(address)
   subnet=str(address).rsplit('.',1)[0]
   if subnet=='192.168.109':device['jump']='root@192.168.8.246'
   elif subnet=='192.168.110':device['jump']='root@192.168.8.113'
   break
  resolved.append(device)
 return resolved

def enroll_device(device, state, digest, vault):
 args=argparse.Namespace(ssh_config='/dev/null',jump=device.get('jump'))
 try:
  status=collector.ssh(args,device['target'],"$ErrorActionPreference='Stop';@{device_id=$env:COMPUTERNAME;installed=(Test-Path 'C:\\ProgramData\\HomeActivityMonitor\\collect-home-app-activity.ps1')}|ConvertTo-Json -Compress")
  if status['device_id'].upper()!=device['device_id']:raise RuntimeError('Computer identity mismatch')
  # Installation is part of the approved enrollment and happens only for pending devices.
  subset=state/('enroll-target-'+hashlib.sha256(device['device_id'].encode()).hexdigest()[:12]+'.json');subset.write_text(json.dumps([device]))
  installed=subprocess.run([sys.executable,str(p),'--devices',str(subset),'--install','--state-dir',str(state/('install-'+hashlib.sha256(device['device_id'].encode()).hexdigest()[:12]))],capture_output=True,text=True,timeout=120)
  if installed.returncode:raise RuntimeError('Installation failed: '+installed.stdout[-700:])
  helper=pathlib.Path(vault)/'90 - System/93 - AI Scripts/bitwarden/bws-get-secret.sh'
  key=subprocess.check_output([str(helper),'af66eb31-d3b9-4547-bfd3-b409010940a2','HOME_ACTIVITY_UPLOAD_KEY_'+device['child'].upper()],text=True,timeout=30).strip()
  payload={'device_id':device['device_id'],'key':key,'url':'https://ops.heavisidetechnology.com/api/home-network/activity-upload','script_hash':digest}
  cmd=['ssh','-F','/dev/null','-o','BatchMode=yes','-o','ConnectTimeout=6']
  if args.jump:cmd+=['-J',args.jump]
  cmd+=[device['target'],collector.powershell(ENROLL)]
  result=subprocess.run(cmd,input=json.dumps(payload),text=True,capture_output=True,timeout=45)
  if result.returncode:raise RuntimeError('Enrollment failed: '+result.stderr[-300:])
  response=json.loads(result.stdout);response.update(child=device['child'],script_hash=digest);return response
 except (RuntimeError,OSError,ValueError,subprocess.SubprocessError) as exc:
  # Never include command text or credential input in diagnostics.
  return {'device_id':device['device_id'],'enrolled':False,'error':str(exc)[:700] if not isinstance(exc,subprocess.TimeoutExpired) else 'Enrollment operation timed out'}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--devices',required=True);ap.add_argument('--state-dir',default='/var/lib/home-activity-collector');ap.add_argument('--vault',default='/home/cvsloane/SloaneVault');ap.add_argument('--network-snapshot',default='/var/lib/home-network-monitor/latest.json');a=ap.parse_args()
 inventory=json.loads(pathlib.Path(a.devices).read_text());snapshot_path=pathlib.Path(a.network_snapshot)
 if snapshot_path.exists():inventory=resolve_device_addresses(inventory,json.loads(snapshot_path.read_text()))
 state=pathlib.Path(a.state_dir);state.mkdir(parents=True,exist_ok=True);receipt=state/'enrolled-devices.json';done=json.loads(receipt.read_text()) if receipt.exists() else {}
 digest=hashlib.sha256(p.with_suffix('.ps1').read_bytes()).hexdigest();reports=[]
 pending=[device for device in inventory if done.get(device['device_id'],{}).get('script_hash')!=digest]
 with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,len(pending))) as pool:
  jobs=[pool.submit(enroll_device,device,state,digest,a.vault) for device in pending]
  for job in concurrent.futures.as_completed(jobs):
   response=job.result();reports.append(response)
   if response.get('enrolled') is True:
    done[response['device_id']]={k:response[k] for k in ['child','script_hash','enrolled']};receipt.write_text(json.dumps(done,indent=2))
 (state/'last-enrollment.json').write_text(json.dumps(reports,indent=2));print(json.dumps({'devices':reports,'enrolled_total':len(done),'expected':len(inventory)}))
 return 0
if __name__=='__main__':raise SystemExit(main())
