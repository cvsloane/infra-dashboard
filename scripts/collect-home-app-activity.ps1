param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z][a-z0-9-]*$')][string]$Child,[int]$SinceHours=24,[switch]$Persist)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$ProgressPreference='SilentlyContinue' 
$ErrorActionPreference='Stop'
if (-not ('HomeActivitySqlite' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class HomeActivitySqlite {
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern int sqlite3_open_v2(byte[] path,out IntPtr db,int flags,IntPtr vfs);
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern int sqlite3_prepare_v2(IntPtr db,byte[] sql,int n,out IntPtr stmt,IntPtr tail);
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern int sqlite3_step(IntPtr stmt);
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern int sqlite3_finalize(IntPtr stmt);
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern int sqlite3_close(IntPtr db);
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern int sqlite3_column_count(IntPtr stmt);
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern IntPtr sqlite3_column_name(IntPtr stmt,int col);
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern IntPtr sqlite3_column_text(IntPtr stmt,int col);
 [DllImport("winsqlite3", CallingConvention=CallingConvention.Cdecl)] static extern IntPtr sqlite3_errmsg(IntPtr db);
 static string Text(IntPtr p) { if(p==IntPtr.Zero)return null; int n=0;while(Marshal.ReadByte(p,n)!=0)n++;byte[] b=new byte[n];Marshal.Copy(p,b,0,n);return Encoding.UTF8.GetString(b); }
 public static List<Dictionary<string,string>> Query(string path,string sql) {
  IntPtr db=IntPtr.Zero,stmt=IntPtr.Zero;
  try { if(sqlite3_open_v2(Encoding.UTF8.GetBytes(path+"\0"),out db,1,IntPtr.Zero)!=0)throw new Exception("Open: "+Text(sqlite3_errmsg(db)));
   if(sqlite3_prepare_v2(db,Encoding.UTF8.GetBytes(sql+"\0"),-1,out stmt,IntPtr.Zero)!=0)throw new Exception("Query: "+Text(sqlite3_errmsg(db)));
   var rows=new List<Dictionary<string,string>>();int rc;
   while((rc=sqlite3_step(stmt))==100){var row=new Dictionary<string,string>();for(int i=0;i<sqlite3_column_count(stmt);i++)row[Text(sqlite3_column_name(stmt,i))]=Text(sqlite3_column_text(stmt,i));rows.Add(row);}
   if(rc!=101)throw new Exception("Read: "+Text(sqlite3_errmsg(db)));return rows;
  } finally {if(stmt!=IntPtr.Zero)sqlite3_finalize(stmt);if(db!=IntPtr.Zero)sqlite3_close(db);}
 }
}
'@
}

$started=[DateTimeOffset]::UtcNow
$root='C:\ProgramData\HomeActivityMonitor'
$since=$started.AddHours(-$SinceHours)
if($Persist -and (Test-Path "$root\checkpoint.txt")){$since=[DateTimeOffset]::Parse([IO.File]::ReadAllText("$root\checkpoint.txt")).AddMinutes(-5)}
$chromeSince=[long](($since.ToUnixTimeMilliseconds()+11644473600000)*1000)
$events=New-Object 'System.Collections.Generic.List[object]'
$errors=New-Object 'System.Collections.Generic.List[string]'
$profiles=New-Object 'System.Collections.Generic.List[object]'
function Event-Id([string]$value){$sha=[Security.Cryptography.SHA256]::Create();try{return 'endpoint:'+([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-','').ToLower()}finally{$sha.Dispose()}}
function Read-Snapshot($path,$sql){
 $dir=Join-Path $env:TEMP ('home-activity-'+[guid]::NewGuid().ToString('N'));New-Item -ItemType Directory $dir|Out-Null
 try {
  $dest=Join-Path $dir 'History'
  foreach($suffix in @('','-wal')){if(Test-Path ($path+$suffix)){$input=[IO.File]::Open($path+$suffix,'Open','Read','ReadWrite');$output=[IO.File]::Create($dest+$suffix);try{$input.CopyTo($output)}finally{$input.Close();$output.Close()}}}
  return [HomeActivitySqlite]::Query($dest,$sql)
 }finally{Remove-Item $dir -Recurse -Force}
}
foreach($user in Get-ChildItem C:\Users -Directory){
 if($user.Name -in @('Default','Default User','Public','All Users','homeadmin','defaultuser100000','WsiAccount')){continue}
 foreach($browser in @(@{Name='Chrome';Path='Google\Chrome'},@{Name='Edge';Path='Microsoft\Edge'},@{Name='Brave';Path='BraveSoftware\Brave-Browser'})){
  $userData=Join-Path $user.FullName ('AppData\Local\'+$browser.Path+'\User Data')
  foreach($profile in Get-ChildItem $userData -Directory -ErrorAction SilentlyContinue){
   $history=Join-Path $profile.FullName 'History';if(-not(Test-Path $history)){continue}
   $status=@{browser=$browser.Name;profile=$profile.Name;windows_user=$user.Name;status='ok';video_playback='not_available'}
   try {
    $sql="SELECT v.id,v.visit_time,u.url,u.title FROM visits v JOIN urls u ON u.id=v.url LEFT JOIN visit_source s ON s.id=v.id WHERE v.visit_time >= $chromeSince AND COALESCE(s.source,1)=1 AND COALESCE(v.originator_cache_guid,'')='' AND (u.url LIKE 'https://www.youtube.com/%' OR u.url LIKE 'https://youtube.com/%' OR u.url LIKE 'https://m.youtube.com/%' OR u.url LIKE 'https://youtu.be/%' OR u.url LIKE 'https://www.roblox.com/%' OR u.url LIKE 'https://roblox.com/%') ORDER BY v.visit_time"
    foreach($row in Read-Snapshot $history $sql){
     $uri=[uri]$row.url;$video=$null;$place=$null
     if($uri.Host -in @('youtube.com','www.youtube.com','m.youtube.com','youtu.be')){
      if($uri.Host -eq 'youtu.be'){$video=$uri.AbsolutePath.Trim('/').Split('/')[0]}
      elseif($uri.AbsolutePath -eq '/watch' -and $uri.Query -match '(?:[?&])v=([A-Za-z0-9_-]{11})(?:&|$)'){$video=$Matches[1]}
      elseif($uri.AbsolutePath -match '^/(?:shorts|live|embed)/([A-Za-z0-9_-]{11})(?:/|$)'){$video=$Matches[1]}
      if($video -notmatch '^[A-Za-z0-9_-]{11}$'){$video=$null}
     }elseif($uri.Host -in @('roblox.com','www.roblox.com') -and $uri.AbsolutePath -match '^/(?:games|experiences)/(\d+)'){$place=$Matches[1]}
     if(-not $video -and -not $place){continue}
     $timestamp=[DateTimeOffset]::FromUnixTimeMilliseconds([long](([long]$row.visit_time/1000)-11644473600000)).ToString('o')
     $canonical=if($video){'https://www.youtube.com/watch?v='+$video}else{'https://www.roblox.com/games/'+$place}
     $events.Add(@{source_event_id=(Event-Id "$env:COMPUTERNAME|$($user.Name)|$($browser.Name)|$($profile.Name)|$($row.id)|$($row.visit_time)|$canonical");event_timestamp=$timestamp;child=$Child;device_id=$env:COMPUTERNAME;hostname=$env:COMPUTERNAME;windows_user=$user.Name;source='browser_history';event_type=$(if($video){'youtube_video'}else{'roblox_game'});app=$browser.Name;browser=$browser.Name;profile=$profile.Name;url=$canonical;domain=$uri.Host;title=$row.title;video_id=$video;place_id=$place;metadata=@{evidence='local_page_visit';playback_confirmed=$false;local_only=$true;collector_version=2}})
    }
   }catch{$status.status='error';$errors.Add("$($browser.Name)/$($profile.Name): $($_.Exception.Message)")}
   $profiles.Add($status)
  }
 }
 $logRoot=Join-Path $user.FullName 'AppData\Local\Roblox\logs'
 $joinEvents=@{}
 foreach($log in Get-ChildItem $logRoot -Filter '*Player*.log' -File -ErrorAction SilentlyContinue | Where-Object {$_.LastWriteTimeUtc -ge $since.UtcDateTime}){
  try {
   $stream=[IO.File]::Open($log.FullName,'Open','Read','ReadWrite');$reader=New-Object IO.StreamReader($stream)
   try {while(-not $reader.EndOfStream){
    $line=$reader.ReadLine();$place=$null;$universe=$null;$evidence=$null
    if($line -match 'Report game_join_loadtime: placeid:(\d+).*?universeid:(\d+)'){$place=$Matches[1];$universe=$Matches[2];$evidence='client_join_report'}
    elseif($line -match "Joining game '.+?' place (\d+)"){$place=$Matches[1];$evidence='join_attempt'}
    if(-not $place -or $line -notmatch '^(\d{4}-\d{2}-\d{2}T[^,]+),'){continue}
    $stamp=[DateTimeOffset]::Parse($Matches[1]);if($stamp -lt $since){continue}
    $key=$stamp.ToString('o')+'|'+$place
    if($joinEvents.ContainsKey($key) -and $evidence -eq 'join_attempt'){continue}
    $joinEvents[$key]=@{source_event_id=(Event-Id "$env:COMPUTERNAME|$($user.Name)|roblox|$key");event_timestamp=$stamp.ToString('o');child=$Child;device_id=$env:COMPUTERNAME;hostname=$env:COMPUTERNAME;windows_user=$user.Name;source='app_log';event_type='roblox_game';app='Roblox';url=('https://www.roblox.com/games/'+$place);domain='roblox.com';title=('Roblox place '+$place);place_id=$place;metadata=@{evidence=$evidence;universe_id=$universe;log_file=$log.Name;active_play_minutes=$null;collector_version=2}}
   }}finally{$reader.Close()}
  }catch{$errors.Add("Roblox/$($log.Name): $($_.Exception.Message)")}
 }
 foreach($event in $joinEvents.Values){$events.Add($event)}
}
$heartbeat=@{source_event_id=(Event-Id "$env:COMPUTERNAME|heartbeat|$($started.ToString('o'))");event_timestamp=$started.ToString('o');child=$Child;device_id=$env:COMPUTERNAME;hostname=$env:COMPUTERNAME;source='app_log';event_type='heartbeat';app='Home Activity Monitor';metadata=@{collector_version=2;profiles=@($profiles.ToArray());errors=@($errors.ToArray());collected_since=$since.ToString('o');upload_mode='home_ssh';away_collection=$Persist.IsPresent;mobile_apps='not_covered';video_playback='not_confirmed'}}
$events.Add($heartbeat)
$payload=@{events=@($events.ToArray());errors=@($errors.ToArray());collected_at=$started.ToString('o')}
$json=ConvertTo-Json -InputObject $payload -Depth 9 -Compress
if($Persist){
 New-Item -ItemType Directory -Force "$root\spool"|Out-Null
 $name=$started.ToString('yyyyMMddTHHmmssfff')+'-'+[guid]::NewGuid().ToString('N')+'.json'
 $dest=Join-Path "$root\spool" $name
 [IO.File]::WriteAllText($dest+'.tmp',$json,(New-Object Text.UTF8Encoding($false)));Move-Item ($dest+'.tmp') $dest
 if($errors.Count -eq 0){[IO.File]::WriteAllText("$root\checkpoint.txt",$started.ToString('o'))}
 $uploadError=$null
 if(Test-Path "$root\upload.json"){
  try {
   $upload=[IO.File]::ReadAllText("$root\upload.json")|ConvertFrom-Json
   $endpoint=[uri]$upload.url
   if($endpoint.Scheme -ne 'https' -or $endpoint.AbsolutePath -ne '/api/home-network/activity-upload'){throw 'Upload endpoint must use HTTPS and the device upload route'}
   foreach($file in Get-ChildItem "$root\spool" -Filter '*.json' -File|Sort-Object Name|Select-Object -First 20){
    $batch=[IO.File]::ReadAllText($file.FullName)|ConvertFrom-Json
    for($offset=0;$offset -lt $batch.events.Count;$offset+=500){
     $last=[Math]::Min($offset+499,$batch.events.Count-1)
     $body=ConvertTo-Json -InputObject @{events=@($batch.events[$offset..$last])} -Depth 12 -Compress
     $response=Invoke-RestMethod -Uri $upload.url -Method Post -Headers @{Authorization=('Bearer '+$upload.key);'X-Home-Device'=$env:COMPUTERNAME} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30
     if($response.ok -ne $true){throw 'Upload not acknowledged'}
    }
    Remove-Item -LiteralPath $file.FullName
   }
  }catch{$uploadError=$_.Exception.Message}
 }
 @{ok=($errors.Count -eq 0);events=$events.Count;errors=@($errors.ToArray());upload_error=$uploadError;spool=$name}|ConvertTo-Json -Depth 4 -Compress
}else{$json}
