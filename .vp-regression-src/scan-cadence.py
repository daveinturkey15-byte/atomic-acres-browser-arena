import subprocess, sys
path = sys.argv[1]
scale = sys.argv[2] if len(sys.argv) > 2 else '96:54'
raw = subprocess.run(['ffmpeg','-v','error','-i',path,'-vf',f'scale={scale},format=gray','-f','rawvideo','-'],capture_output=True).stdout
w,h = [int(x) for x in scale.split(':')]
fs = w*h
n = len(raw)//fs
print(f'frames={n} size={fs}')
runs=[]; cur=0; best=(0,0)
for i in range(1,n):
    a=raw[(i-1)*fs:i*fs]; b=raw[i*fs:(i+1)*fs]
    ad=sum(abs(x-y) for x,y in zip(a,b))/fs
    cp=sum(1 for x,y in zip(a,b) if abs(x-y)>2)/fs
    nd = ad<=7.0 and cp<=0.03
    if nd: cur+=1
    else:
        if cur>0: runs.append((i-cur,cur))
        cur=0
if cur>0: runs.append((n-cur,cur))
runs.sort(key=lambda r:-r[1])
print('top runs (start,len):', runs[:5])
print('max run:', runs[0][1] if runs else 0)
