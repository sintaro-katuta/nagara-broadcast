import json, sys, subprocess
from pathlib import Path
import numpy as np
from scipy.signal import correlate, fftconvolve

root=Path(__file__).resolve().parent.parent
day=sys.argv[1]
script=json.loads((root/'data/weekly'/day/'script.json').read_text())
out=root/'work/caption-recovery'/day

def samples(path):
    return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','1','-ar','6000','-']),dtype='<f4').astype('float64')

audio=samples(root/'data/weekly'/day/'episode.mp3')
manifest_path=root/'data/weekly'/day/'episode.mp3.sound'/'sound-manifest.json'
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
song=float(manifest.get('instrumentalSeconds',0))
split=2+float(manifest.get('dialogueSplitSeconds',0))
song_applied=False
cues=[]; scores=[]
for i,turn in enumerate(script['turns']):
    voice=samples(out/f'{i}.wav')
    corr=correlate(audio,voice,mode='valid',method='fft')
    energy=fftconvolve(audio*audio,np.ones(len(voice)),mode='valid')
    corr=corr/(np.sqrt(np.maximum(energy,1e-15))*np.linalg.norm(voice))
    if cues and song and not song_applied and abs(cues[-1]['end']-split)<2:
        song_applied=True
        gap=song
    else:gap=0
    lower=max(0,int((cues[-1]['end']-1+gap)*6000)) if cues else 0
    upper=min(len(corr),int((cues[-1]['end']+2.5+gap)*6000)) if cues else min(len(corr),18000)
    if lower>=upper:raise ValueError(f'{day} 発言{i+1} 探索範囲が不正です。')
    index=lower+int(np.argmax(np.abs(corr[lower:upper])));score=float(abs(corr[index]));start=index/6000;end=start+len(voice)/6000
    if score<0.025 or (not cues and start>3) or (cues and (start<cues[-1]['end']-1.0 or start>cues[-1]['end']+2.5+gap)):raise ValueError(f'{day} 発言{i+1} 照合不十分: score={score:.3f}, time={start:.3f}')
    if cues and start<cues[-1]['end']:cues[-1]['end']=round(start,3)
    cues.append({'start':round(start,3),'end':round(end,3),'text':turn['text']});scores.append(score)
if not -0.3 <= len(audio)/6000-cues[-1]['end'] <= 3.0:raise ValueError(f'{day} 最終発言と番組終了の時刻が合いません。')
(out/'captions.json').write_text(json.dumps(cues,ensure_ascii=False,indent=2)+'\n')
(out/'quality.json').write_text(json.dumps({'minCorrelation':min(scores),'correlations':scores},indent=2)+'\n')
print(f'{day} aligned {len(cues)} min correlation={min(scores):.3f}',flush=True)
