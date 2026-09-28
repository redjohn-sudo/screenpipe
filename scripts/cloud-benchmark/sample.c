// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
#include <libproc.h>
#include <mach/mach_time.h>
#include <time.h>
#include <math.h>
#include <sys/resource.h>
#include <sys/time.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc,char **argv){
 if(argc!=3)return 2; int pid=atoi(argv[1]); FILE *f=fopen(argv[2],"w"); if(!f)return 3;
 // Validate the CPU time unit against CLOCK_PROCESS_CPUTIME_ID on this guest.
 struct rusage_info_v4 before={0},after={0}; struct timespec a,b;
 mach_timebase_info_data_t tb; mach_timebase_info(&tb);
 proc_pid_rusage(getpid(),RUSAGE_INFO_V4,(rusage_info_t*)&before);
 clock_gettime(CLOCK_PROCESS_CPUTIME_ID,&a);
 volatile double accumulator=1.0;
 do { for(int k=0;k<10000;k++)accumulator=accumulator*1.00000001+0.00001; clock_gettime(CLOCK_PROCESS_CPUTIME_ID,&b); }
 while((b.tv_sec-a.tv_sec)+(b.tv_nsec-a.tv_nsec)/1e9<0.5);
 proc_pid_rusage(getpid(),RUSAGE_INFO_V4,(rusage_info_t*)&after);
 double known=(b.tv_sec-a.tv_sec)+(b.tv_nsec-a.tv_nsec)/1e9;
 double raw=(double)(after.ri_user_time+after.ri_system_time-before.ri_user_time-before.ri_system_time);
 double ns=1e-9,mach=(double)tb.numer/tb.denom/1e9;
 double factor=fabs(raw*ns-known)<fabs(raw*mach-known)?ns:mach;
 fprintf(f,"{\"kind\":\"calibration\",\"clockCpuSeconds\":%.9f,\"rawDelta\":%.0f,\"secondsPerUnit\":%.12g}\n",known,raw,factor);
 if(fabs(raw*factor-known)/known>0.05)return 4;
 for(int i=0;i<14400;i++){
  struct rusage_info_v4 r={0};struct timeval t;
  if(proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t*)&r)!=0)break;
  gettimeofday(&t,0);
  fprintf(f,"{\"unix\":%.6f,\"cpuSeconds\":%.6f,\"rssBytes\":%llu,\"footprintBytes\":%llu,\"readBytes\":%llu,\"writeBytes\":%llu}\n",(double)t.tv_sec+t.tv_usec/1e6,(double)(r.ri_user_time+r.ri_system_time)*factor,r.ri_resident_size,r.ri_phys_footprint,r.ri_diskio_bytesread,r.ri_diskio_byteswritten);
  fflush(f);usleep(500000);
 }
 fclose(f);return 0;
}
