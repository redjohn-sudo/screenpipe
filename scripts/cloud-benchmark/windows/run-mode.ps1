# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
param(
  [Parameter(Mandatory)][ValidateSet('automatic','low-impact','more-detail')][string]$Mode,
  [Parameter(Mandatory)][int]$Port
)
$ErrorActionPreference='Stop'
$task='scroll7335-bench4-20260928'
$scratch="C:\screenpipe-worker\scratch\$task"
$result="C:\screenpipe-worker\results\$task"
$out="$result\raw\mode-$Mode"
$data="$scratch\data-$Mode"
$bin='C:\spdev\debug-dev\screenpipe.exe'
$apiKey='SYNTHETIC_TASK_LOCAL_REDACTED'
$apiHeaders=@{Authorization="Bearer $apiKey"}
$detail = @{automatic='auto';'low-impact'='low_impact';'more-detail'='more_detail'}[$Mode]
New-Item -ItemType Directory -Force -Path $out,$data,(Join-Path $out 'desktop-observations'),(Join-Path $out 'quiet-polls'),(Join-Path $out 'samples') | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @'
using System; using System.Diagnostics; using System.Runtime.InteropServices; using System.Threading;
public static class NativeBench {
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId(); [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a,uint b,bool on); [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h); [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int n); [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr h); [DllImport("user32.dll")] static extern void keybd_event(byte v,byte s,uint f,UIntPtr x);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,System.Text.StringBuilder b,int n);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 public static string Foreground(){var h=GetForegroundWindow();uint p;GetWindowThreadProcessId(h,out p);var b=new System.Text.StringBuilder(512);GetWindowText(h,b,512);return p+"|"+b.ToString();}
 public static void ForceForeground(IntPtr h){uint p,q;uint target=GetWindowThreadProcessId(h,out p),fg=GetWindowThreadProcessId(GetForegroundWindow(),out q),mine=GetCurrentThreadId();keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);AttachThreadInput(mine,fg,true);AttachThreadInput(mine,target,true);ShowWindow(h,9);BringWindowToTop(h);SetForegroundWindow(h);SetFocus(h);AttachThreadInput(mine,target,false);AttachThreadInput(mine,fg,false);}
 public static long[] Wheels(int count,int intervalMs,int delta){var a=new long[count];SetCursorPos(220,400);var sw=Stopwatch.StartNew();long origin=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();for(int i=0;i<count;i++){long due=(long)i*intervalMs;while(sw.ElapsedMilliseconds<due)Thread.Sleep(1);a[i]=origin+sw.ElapsedMilliseconds;mouse_event(0x0800,0,0,unchecked((uint)delta),UIntPtr.Zero);}return a;}
 public static void Click(int x,int y){SetCursorPos(x,y);mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);}
}
'@
function EdgeWindow { Get-Process msedge -ErrorAction SilentlyContinue|Where-Object MainWindowHandle -ne 0|Select-Object -First 1 }
function FocusEdge { [Windows.Forms.SendKeys]::SendWait('{ESC}');for($i=0;$i -lt 20;$i++){$w=EdgeWindow;if($w){[Microsoft.VisualBasic.Interaction]::AppActivate($w.Id)|Out-Null;[NativeBench]::ForceForeground($w.MainWindowHandle)};Start-Sleep -Milliseconds 250;$fg=[NativeBench]::Foreground();$pidText=($fg-split'\|',2)[0];$p=Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue;if($p.ProcessName -eq 'msedge'){return $fg}};throw "foreground verification failed: actual $fg" }
function OpenPage([string]$page,[int]$settle=10){$path=(Resolve-Path "$scratch\fixture-$page.html").Path;$url=([uri]$path).AbsoluteUri+"?mode=$Mode";FocusEdge|Out-Null;[Windows.Forms.Clipboard]::SetText($url);[Windows.Forms.SendKeys]::SendWait('^l');[Windows.Forms.SendKeys]::SendWait('^v');[Windows.Forms.SendKeys]::SendWait('{ENTER}');Start-Sleep -Seconds $settle;$fg=FocusEdge;if($fg -notmatch "ScrollBench Page $($page.ToUpper())"){throw "wrong Edge title: $fg"};return $fg}
function TakeDesktopShot([string]$name){$b=[Drawing.Bitmap]::new(1024,768);$g=[Drawing.Graphics]::FromImage($b);$g.CopyFromScreen(0,0,0,0,$b.Size);$g.Dispose();$b.Save((Join-Path $out "desktop-observations\$name.png"),[Drawing.Imaging.ImageFormat]::Png);$b.Dispose()}
function DataBytes { [long]((Get-ChildItem $data -Recurse -File -ErrorAction SilentlyContinue|Measure-Object Length -Sum).Sum??0) }
function StartSampler([string]$case,[int]$seconds){
  Start-ThreadJob -ArgumentList $engine.Id,$seconds,(Join-Path $out "samples\$case.json") -ScriptBlock {param($rootPid,$duration,$path);$rows=@();$until=(Get-Date).AddSeconds($duration);while((Get-Date)-lt$until){$utc=(Get-Date).ToUniversalTime().ToString('o');$all=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue);$ids=New-Object 'System.Collections.Generic.HashSet[int]';[void]$ids.Add([int]$rootPid);$changed=$true;while($changed){$changed=$false;foreach($x in $all){if($ids.Contains([int]$x.ParentProcessId)-and-not$ids.Contains([int]$x.ProcessId)){[void]$ids.Add([int]$x.ProcessId);$changed=$true}}};$procs=@();foreach($id in $ids){$p=Get-Process -Id $id -ErrorAction SilentlyContinue;if($p){$procs+=[ordered]@{pid=$p.Id;name=$p.ProcessName;cpuSeconds=$p.CPU;workingSet=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64;peakWorkingSet=$p.PeakWorkingSet64}}};$os=(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue).PercentProcessorTime;$rows+=[ordered]@{utc=$utc;osTotalCpuPercent=$os;processes=$procs};Start-Sleep -Seconds 1};$rows|ConvertTo-Json -Depth 8|Set-Content -Encoding utf8 $path }
}
function FinishSampler($job){Wait-Job $job|Out-Null;Receive-Job $job|Out-Null;Remove-Job $job}
function TraceWheels([string]$case,[long[]]$times,[int]$delta){foreach($ms in $times){$script:trace.Add([ordered]@{mode=$Mode;case=$case;event='wheel';delta=$delta;utc=[DateTimeOffset]::FromUnixTimeMilliseconds($ms).ToString('o');foreground=[NativeBench]::Foreground()})}}
function QuietPoll([string]$case,[string]$finalEventUtc){$poll=Start-Process bun -ArgumentList @('run',"$scratch\poll-db.ts","$data\db.sqlite",(Join-Path $out "quiet-polls\$case.json"),$finalEventUtc,'12000') -PassThru -WindowStyle Hidden;Wait-Process -Id $poll.Id -Timeout 20;TakeDesktopShot "$case-final";[ordered]@{finalEventUtc=$finalEventUtc;quietEndUtc=(Get-Date).ToUniversalTime().ToString('o');foreground=[NativeBench]::Foreground();dataBytes=DataBytes}}

$store=[ordered]@{settings=[ordered]@{recordingDetail=$detail;powerMode='auto';videoQuality='balanced';idleCaptureIntervalMs=$null;captureScroll=$true;disableAudio=$true;analyticsEnabled=$false;disableMeetingDetector=$true;disableSnapshotCompaction=$true;port=$Port}}
$store|ConvertTo-Json -Depth 8|Set-Content -Encoding utf8 "$data\store.bin"
Copy-Item "$data\store.bin" "$out\settings-before.json" -Force
$engineOut="$out\engine.stdout.log";$engineErr="$out\engine.stderr.log"
$args=@('record','--data-dir',$data,'--port',"$Port",'--disable-audio','--disable-telemetry','--disable-meeting-detector','--disable-snapshot-compaction','--capture-scroll','true','--video-quality','balanced','--recording-detail',$detail,'--ignored-windows','PRIVATE_BENCH')
$priorApiKey=$env:SCREENPIPE_API_KEY;$env:SCREENPIPE_API_KEY=$apiKey
$engine=Start-Process -FilePath $bin -ArgumentList $args -PassThru -WindowStyle Hidden -RedirectStandardOutput $engineOut -RedirectStandardError $engineErr
$env:SCREENPIPE_API_KEY=$priorApiKey
$trace=New-Object 'System.Collections.Generic.List[object]';$cases=New-Object 'System.Collections.Generic.List[object]'
try {
 $ready=$false;for($i=0;$i -lt 150;$i++){try{if((Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/health" -TimeoutSec 1).StatusCode -eq 200){$ready=$true;break}}catch{};Start-Sleep -Seconds 1};if(-not$ready){throw 'engine readiness timeout'}
 (Invoke-RestMethod -Headers $apiHeaders "http://127.0.0.1:$Port/power")|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 "$out\power-ready.json"
 Copy-Item "$data\store.bin" "$out\settings-effective-store.json" -Force
 $edgeExe='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe';$url=([uri](Resolve-Path "$scratch\fixture-a.html").Path).AbsoluteUri+"?mode=$Mode";$edgeProfile="$scratch\edge-$Mode";$edge=Start-Process $edgeExe -ArgumentList @("--user-data-dir=$edgeProfile",'--no-first-run','--disable-first-run-ui','--new-window','--start-maximized','--hide-crash-restore-bubble','--disable-features=msEdgeSidebarV2',$url) -PassThru;Start-Sleep -Seconds 8;OpenPage 'a' 10|Out-Null;Start-Sleep -Seconds 15
 for($rep=1;$rep-le3;$rep++){
   if($rep-gt1){OpenPage 'a' 10|Out-Null}
   $trial="trial-$rep";$fg0=FocusEdge;$b0=DataBytes;$idleStart=(Get-Date).ToUniversalTime().ToString('o');$j=StartSampler "$trial-idle" 30;Start-Sleep -Seconds 30;$idleEnd=(Get-Date).ToUniversalTime().ToString('o');FinishSampler $j;$b1=DataBytes
   $cases.Add([ordered]@{case="$trial-idle";kind='idle';repeat=$rep;startUtc=$idleStart;endUtc=$idleEnd;foregroundStart=$fg0;foregroundEnd=[NativeBench]::Foreground();dataBytesStart=$b0;dataBytesEnd=$b1})
   $scrollStart=(Get-Date).ToUniversalTime().ToString('o');$j=StartSampler "$trial-scroll60" 61;$times=[NativeBench]::Wheels(1200,50,-20);TraceWheels "$trial-scroll60" $times -20;FinishSampler $j;$final=[DateTimeOffset]::FromUnixTimeMilliseconds($times[-1]).ToString('o');$quiet=QuietPoll "$trial-scroll60" $final;$cases.Add([ordered]@{case="$trial-scroll60";kind='continuous';repeat=$rep;startUtc=$scrollStart;finalEventUtc=$final;quietEndUtc=$quiet.quietEndUtc;foregroundEnd=$quiet.foreground;dataBytesStart=$b1;dataBytesEnd=$quiet.dataBytes;wheelEvents=1200})
 }
 for($rep=1;$rep-le3;$rep++){OpenPage 'a' 10|Out-Null;$name="short2-$rep";$start=(Get-Date).ToUniversalTime().ToString('o');$j=StartSampler $name 3;$times=[NativeBench]::Wheels(40,50,-20);TraceWheels $name $times -20;FinishSampler $j;$final=[DateTimeOffset]::FromUnixTimeMilliseconds($times[-1]).ToString('o');$quiet=QuietPoll $name $final;$cases.Add([ordered]@{case=$name;kind='short';repeat=$rep;startUtc=$start;finalEventUtc=$final;quietEndUtc=$quiet.quietEndUtc;foregroundEnd=$quiet.foreground;dataBytesEnd=$quiet.dataBytes;wheelEvents=40})}
 OpenPage 'a' 10|Out-Null;$name='reverse4-down4-up';$start=(Get-Date).ToUniversalTime().ToString('o');$j=StartSampler $name 9;$down=[NativeBench]::Wheels(80,50,-20);TraceWheels $name $down -20;$up=[NativeBench]::Wheels(80,50,20);TraceWheels $name $up 20;FinishSampler $j;$final=[DateTimeOffset]::FromUnixTimeMilliseconds($up[-1]).ToString('o');$quiet=QuietPoll $name $final;$cases.Add([ordered]@{case=$name;kind='reverse';startUtc=$start;finalEventUtc=$final;quietEndUtc=$quiet.quietEndUtc;foregroundEnd=$quiet.foreground;dataBytesEnd=$quiet.dataBytes;wheelEvents=160})
 OpenPage 'a' 10|Out-Null;$name='navigation-focus-away-back';$start=(Get-Date).ToUniversalTime().ToString('o');$before=[NativeBench]::Foreground();$navigated=OpenPage 'b' 3;$notepad=Start-Process notepad.exe -PassThru;Start-Sleep -Seconds 2;$away=[NativeBench]::Foreground();$back=FocusEdge;Start-Sleep -Seconds 4;$final=(Get-Date).ToUniversalTime().ToString('o');$quiet=QuietPoll $name $final;$cases.Add([ordered]@{case=$name;kind='navigation-focus';startUtc=$start;finalEventUtc=$final;quietEndUtc=$quiet.quietEndUtc;foregroundBefore=$before;foregroundNavigated=$navigated;foregroundAway=$away;foregroundBack=$back;foregroundEnd=$quiet.foreground;dataBytesEnd=$quiet.dataBytes});Stop-Process -Id $notepad.Id -ErrorAction SilentlyContinue
 $cases|ConvertTo-Json -Depth 8|Set-Content -Encoding utf8 "$out\cases.json";$trace|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8 "$out\input-trace.json";[NativeBench]::Foreground()|Set-Content -Encoding utf8 "$out\final-foreground.txt";(Invoke-RestMethod -Headers $apiHeaders "http://127.0.0.1:$Port/power")|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 "$out\power-final.json"
} finally {Stop-Process -Id $engine.Id -ErrorAction SilentlyContinue;Wait-Process -Id $engine.Id -Timeout 20 -ErrorAction SilentlyContinue;Get-Process msedge -ErrorAction SilentlyContinue|Stop-Process -ErrorAction SilentlyContinue}
