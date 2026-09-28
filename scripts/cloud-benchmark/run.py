# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Isolated native recording benchmark. Run only inside disposable macOS CI."""
import datetime, hashlib, json, os, pathlib, signal, sqlite3, subprocess, sys, threading, time, urllib.request
ROOT = pathlib.Path(sys.argv[1]).resolve()
BIN = pathlib.Path(sys.argv[2]).resolve()
FIX = pathlib.Path(sys.argv[3]).resolve()
SAMPLE = pathlib.Path(sys.argv[4]).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
fixture_dir = ROOT / 'fixture'; fixture_dir.mkdir(exist_ok=True)
processes=[]
poll_stop=threading.Event()
def write(path, data):
    path.write_text(json.dumps(data, indent=2)+'\n')
def cmd(seconds=0, direction=-12, window=0, reset=False):
    identity=str(time.time_ns())
    data={'id':identity,'seconds':seconds,'direction':direction,'window':window,'reset':reset}
    temporary=fixture_dir/'command.tmp'; write(temporary,data); temporary.replace(fixture_dir/'command.json')
    deadline=time.monotonic()+seconds+20
    while time.monotonic()<deadline:
        try:
            result=json.loads((fixture_dir/'done.json').read_text())
            if result['id']==identity:return result
        except (FileNotFoundError,json.JSONDecodeError):pass
        time.sleep(.1)
    raise RuntimeError('Native fixture command timed out: '+identity)
def stop(proc):
    if proc.poll() is None:
        proc.send_signal(signal.SIGINT)
        try:proc.wait(30)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()
def api(route):
    with urllib.request.urlopen('http://127.0.0.1:3030/'+route, timeout=3) as r:return json.load(r)
def health():return api('health')
def poll_policy(folder):
    while not poll_stop.wait(1):
        try:
            with (folder/'policy.jsonl').open('a') as stream:stream.write(json.dumps({'unix':time.time(),'status':api('power')})+'\n')
        except Exception:pass
def run_cases(mode, folder):
    cases=[]
    for repetition in range(2):
        for name in ['idle','continuous','short','reverse','focus']:
            cmd(reset=True); time.sleep(3)
            start=time.time()
            events=[]
            if name=='idle':time.sleep(15)
            elif name=='continuous':events.append(cmd(30, -12 if repetition%2==0 else 12))
            elif name=='short':events.append(cmd(2))
            elif name=='reverse':events.extend([cmd(3),cmd(3,12)])
            elif name=='focus':events.extend([cmd(3),cmd(0,window=1),cmd(3,window=1)])
            input_end=time.time();time.sleep(6)
            cases.append({'name':name,'repetition':repetition,'start':start,'inputEnd':input_end,'end':time.time(),'commands':events})
            write(folder/'cases.json',cases)
            if mode!='control':
                try:
                    write(folder/'health-latest.json',health())
                    with (folder/'policy.jsonl').open('a') as stream:stream.write(json.dumps({'unix':time.time(),'status':api('power')})+'\n')
                except Exception as error:raise RuntimeError('Recorder stopped during benchmark') from error
    return cases
try:
    fixture = subprocess.Popen([str(FIX),str(fixture_dir)],stdout=(ROOT/'fixture.stdout').open('w'),stderr=subprocess.STDOUT); processes.append(fixture)
    time.sleep(4);cmd(reset=True);cmd(2)
    rows=[json.loads(x) for x in (fixture_dir/'fixture.jsonl').read_text().splitlines()]
    ready=next(x for x in rows if x['kind']=='ready')
    assert ready['accessibility'] and ready['screenRecording'],ready
    assert any(x['kind']=='received' for x in rows),'No native scroll events received'
    write(ROOT/'native-preflight.json',{'ready':ready,'nativeEventsReceived':sum(x['kind']=='received' for x in rows)})
    if os.environ.get('PREFLIGHT_ONLY')=='1':sys.exit(0)
    write(ROOT/'binary.json',{'sha256':hashlib.sha256(BIN.read_bytes()).hexdigest(),'path':str(BIN),'sourceSha':os.environ['SUBJECT_SHA'],'profile':'release','audio':False,'videoQuality':'high','powerMode':'auto','apiAuth':'disabled only on disposable localhost-bound fixture'})
    # Alternate mode order across architectures to expose order/warm-up effects.
    modes=['control','auto','low_impact','more_detail'] if os.uname().machine=='arm64' else ['control','more_detail','low_impact','auto']
    for mode in modes:
        folder=ROOT/mode; folder.mkdir(exist_ok=True)
        recorder=None; sampler=None; poller=None
        if mode!='control':
            data=folder/'data';data.mkdir(exist_ok=True)
            args=[str(BIN),'record','--data-dir',str(data),'--disable-audio','--api-auth=false','--disable-telemetry','--disable-meeting-detector','--disable-snapshot-compaction','--capture-scroll','true','--video-quality','high','--recording-detail',mode]
            write(folder/'command.json',args)
            recorder=subprocess.Popen(args,stdout=(folder/'recorder.log').open('w'),stderr=subprocess.STDOUT);processes.append(recorder)
            sampler=subprocess.Popen([str(SAMPLE),str(recorder.pid),str(folder/'samples.jsonl')]);processes.append(sampler)
            deadline=time.monotonic()+90
            while time.monotonic()<deadline:
                assert recorder.poll() is None,'Recorder exited during startup'
                try:
                    status=health();write(folder/'health-start.json',status);break
                except Exception:time.sleep(2)
            else:raise RuntimeError('Recorder API failed to start')
            write(folder/'power-first-install.json',api('power'))
            request=urllib.request.Request('http://127.0.0.1:3030/power',data=json.dumps({'mode':'auto'}).encode(),headers={'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(request,timeout=5) as response:write(folder/'power-controlled.json',json.load(response))
            poll_stop.clear();poller=threading.Thread(target=poll_policy,args=(folder,),daemon=True);poller.start()
            time.sleep(60) # Exclude installation/startup work identically on both revisions.
            write(folder/'health-after-settle.json',health())
        try:
            run_cases(mode,folder)
            if recorder:
                write(folder/'power-measurement-end.json',api('power'))
                # Measure, do not hide, the time required for deferred text.
                drain_started=time.monotonic()
                while time.monotonic()-drain_started < 120:
                    status=api('power')
                    if status.get('recording_detail',{}).get('text_pending',0)==0:break
                    time.sleep(1)
                write(folder/'text-drain.json',{'elapsedSeconds':time.monotonic()-drain_started,'status':api('power')})
                write(folder/'search-at-end.json',api('search?content_type=ocr&limit=1000'))
        finally:
            poll_stop.set()
            if poller:poller.join(4)
            if recorder:stop(recorder)
            if sampler:stop(sampler)
        if mode!='control':
            databases=list((folder/'data').rglob('*.sqlite'))
            exports={}
            for db in databases:
                connection=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True);connection.row_factory=sqlite3.Row
                tables={r[0] for r in connection.execute("select name from sqlite_master where type='table'")}
                for table in ['frames','ui_events','elements','frame_ocr_jobs']:
                    if table in tables:
                        values=[dict(r) for r in connection.execute('select * from '+table)]
                        write(folder/(table+'.json'),values);exports[table]=len(values)
                # A stopped process can leave committed rows in its WAL. Retain
                # a consistent standalone backup rather than an incomplete copy
                # of db.sqlite without its journal.
                backup=sqlite3.connect(folder/'database-snapshot.sqlite')
                try:connection.backup(backup)
                finally:backup.close()
                connection.close()
            write(folder/'storage.json',{'fileBytes':sum(p.stat().st_size for p in (folder/'data').rglob('*') if p.is_file()),'rows':exports})
            assert exports.get('frames',0)>0,'No durable screenshot frames'
            assert exports.get('ui_events',0)>0,'No native input rows'
            frames=json.loads((folder/'frames.json').read_text())
            assert any(f.get('accessibility_text') for f in frames),'No accessibility text captured'
    write(ROOT/'completed.json',{'sourceSha':os.environ['SUBJECT_SHA'],'unix':time.time(),'modes':modes})
finally:
    for process in reversed(processes):stop(process)
