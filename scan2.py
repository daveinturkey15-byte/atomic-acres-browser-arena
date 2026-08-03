import subprocess
raw = subprocess.run(['ffmpeg','-v','error','-i','artifacts/pass66/killstreak-demo-capture/staged/adrenaline.mp4','-vf','scale=96:54,format=gray','-f','rawvideo','-'],capture_output=True).stdout
fs=96*54; n=len(raw)//fs
deltas=[]
for i in range(1,n):
    a=raw[(i-1)*fs:i*fs]; b=raw[i*fs:(i+1)*fs]
    ad=sum(abs(x-y) for x,y in zip(a,b))/fs
    deltas.append(ad)
# print every 5th delta as a compact profile
print('frame:delta profile (every 5th):')
print(' '.join(f'{i+1}:{d:.1f}' for i,d in enumerate(deltas) if i%5==0))
print('min',round(min(deltas),1),'max',round(max(deltas),1),'mean',round(sum(deltas)/len(deltas),1))
