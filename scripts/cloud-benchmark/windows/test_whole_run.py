# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
import datetime
from analyze_whole_run import measure, timestamp

def sample(second, cpu):
    return dict(utc=datetime.datetime.fromtimestamp(second, datetime.timezone.utc).isoformat(),
                processes=[dict(pid=1, cpuSeconds=cpu, workingSet=2**20, privateBytes=2**21)])

rows=[sample(0,0),sample(1,2),sample(2,4),sample(3,6),sample(4,8)]
x=measure(rows,.5,1.5,4)
assert x['cpuSeconds']==2 and x['observedSeconds']==1
assert x['cpuPercentOneCore']==200 and x['cpuPercentMachineCapacity']==50
assert x['rssPeakMiB']==1 and x['privatePeakMiB']==2
active=measure(rows,0,2,4);total=measure(rows,0,4,4)
assert active['cpuSeconds']==4 and total['cpuSeconds']==8
assert measure(rows,8,9,4)['cpuPercentOneCore'] is None
lost=[sample(0,0),{**sample(1,2),'processes':[]}]
assert measure(lost,0,1,4)['disappearedProcessIds']==[1]
print('Windows CPU audit calibration passed: normalization, boundaries, background cost, missing observations and exited processes')

assert timestamp("2026-09-29T00:31:02.9577443Z") == timestamp("2026-09-29T00:31:02.957744Z")
