"""Create original, reproducible instrumental cues and mix a weekly show."""
from __future__ import annotations
import argparse
from array import array
from datetime import date
import hashlib
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys
import wave

RATE = 24000
PROFILES = {
 0: dict(name='静かな振り返り', bpm=68, root=50, scale=[0,2,3,5,7,9,10], voice='soft', drums=False, meter=4),
 1: dict(name='軽やかな発見', bpm=98, root=48, scale=[0,2,4,7,9], voice='marimba', drums=True, meter=4),
 2: dict(name='前向きな一歩', bpm=112, root=48, scale=[0,2,4,5,7,9,11], voice='pluck', drums=True, meter=4),
 3: dict(name='音楽喫茶', bpm=82, root=48, scale=[0,2,4,7,9,11], voice='soft', drums=True, meter=4),
 4: dict(name='小さな発明', bpm=104, root=50, scale=[0,2,3,5,7,10], voice='bell', drums=True, meter=4),
 5: dict(name='軽快な暮らし', bpm=96, root=48, scale=[0,2,4,7,9], voice='pluck', drums=True, meter=4),
 6: dict(name='ゆっくりお茶の時間', bpm=72, root=48, scale=[0,2,4,7,9], voice='soft', drums=False, meter=3),
}

def sound_seed(day: str, role: str) -> int:
    return int.from_bytes(hashlib.sha256(f'nagara-v1:{day}:{role}'.encode()).digest()[:8], 'big')

def note(buffer: array, start: float, duration: float, midi: int, gain: float, tone: str):
    first=max(0,round(start*RATE)); length=min(round(duration*RATE),len(buffer)-first)
    if length<=0:return
    frequency=440*2**((midi-69)/12)
    for i in range(length):
        t=i/RATE
        attack=min(1,t/(.035 if tone=='soft' else .008))
        release=min(1,(length-i)/(RATE*.12))
        decay=math.exp(-t*({'bell':3.7,'marimba':5.2,'pluck':3.1,'soft':1.4,'bass':3.0}.get(tone,3.0)))
        phase=2*math.pi*frequency*t
        if tone=='bell': value=math.sin(phase)+.22*math.sin(phase*2.76)*math.exp(-t*6)
        elif tone=='marimba': value=math.sin(phase)+.17*math.sin(phase*4)*math.exp(-t*9)
        elif tone=='pluck': value=math.sin(phase)+.3*math.sin(phase*2)*math.exp(-t*5)+.12*math.sin(phase*3)*math.exp(-t*8)
        elif tone=='bass': value=math.sin(phase)+.12*math.sin(phase*2)
        else: value=math.sin(phase)+.14*math.sin(phase*2)+.04*math.sin(phase*3)
        buffer[first+i]+=gain*attack*release*decay*value

def drum(buffer: array, start: float, kind: str, rng: random.Random, strength: float=1):
    first=round(start*RATE);length=min(round((.16 if kind=='kick' else .055)*RATE),len(buffer)-first)
    if length<=0:return
    phase=0.0
    for i in range(length):
        t=i/RATE
        if kind=='kick':
            phase+=2*math.pi*(52+90*math.exp(-t*35))/RATE
            value=math.sin(phase)*math.exp(-t*23)*.18
        elif kind=='snare': value=(rng.random()*2-1)*math.exp(-t*65)*.042
        else: value=(rng.random()*2-1)*math.exp(-t*110)*.022
        buffer[first+i]+=strength*value

def compose(day: str, role: str, seconds: float, weekday: int) -> tuple[array, dict]:
    profile=PROFILES[weekday];seed=sound_seed(day,role);rng=random.Random(seed)
    bpm=profile['bpm']+rng.choice([-4,0,4]);beat=60/bpm;meter=profile['meter'];root=profile['root']+rng.choice([-2,0,2,3,5]);scale=profile['scale']
    samples=array('f',[0])*round(seconds*RATE)
    # A small family of progressions; the seed chooses voicing, rhythm and melody.
    progressions=[[0,5,3,4],[0,3,5,4],[0,4,5,3],[0,5,4,3],[0,2,3,4],[0,3,0,4],[0,4,3,4],[0,2,5,4],[0,5,2,4],[0,3,4,0],[0,4,2,3],[0,2,4,3]]
    progression=rng.choice(progressions); pattern=rng.choice([[0,2,1,3],[0,1,3,2],[0,3,1,2],[0,1,2,3]])
    bar=beat*meter; n_bars=math.ceil(seconds/bar)
    for b in range(n_bars):
        degree=progression[b%len(progression)];base=root+scale[degree%len(scale)]+12*(degree//len(scale)); start=b*bar
        # Chord tones are selected from the scale rather than arbitrary chromatic notes.
        chord=[root+scale[(degree+step)%len(scale)]+12*((degree+step)//len(scale)) for step in [0,2,4]]
        note(samples,start,bar*.95,base-12,.065,'bass')
        for step in range(meter*2):
            at=start+step*beat/2
            if at>=seconds:break
            tone=chord[pattern[step%4]%3]+12
            if rng.random()>.12:note(samples,at,beat*.7,tone,.035,profile['voice'])
        if b%2==0:
            for pitch in chord:note(samples,start,bar*.8,pitch,.012,'soft')
        if profile['drums']:
            for beat_no in range(meter):
                at=start+beat_no*beat
                if beat_no==0 or beat_no==2:drum(samples,at,'kick',rng,.8)
                if beat_no==1 or beat_no==3:drum(samples,at,'snare',rng,.7)
                drum(samples,at+beat*.5,'hat',rng,.7)
    # A melody with rests and repeated motifs avoids a constant stream of notes.
    motif=[rng.randrange(len(scale)) for _ in range(5)]
    for b in range(n_bars):
        if b%4==3 and role.startswith('bed'):continue
        for k in range(meter):
            at=b*bar+k*beat
            if at>=seconds or rng.random()<.38:continue
            degree=motif[(b*meter+k)%len(motif)]
            pitch=root+12+scale[degree]+(12 if rng.random()<.12 else 0)
            note(samples,at+beat*rng.choice([0,.0,.5]),beat*rng.choice([.55,.8,1.25]),pitch,.042,profile['voice'])
    fade_in=min(.5,seconds/4);fade_out=min(1.4,seconds/4)
    for i in range(len(samples)):
        t=i/RATE;samples[i]*=min(1,t/fade_in,(seconds-t)/fade_out)
    return samples,{'role':role,'seed':f'{seed:016x}','profile':profile['name'],'bpm':bpm,'rootMidi':root,'progression':progression,'durationSeconds':seconds}

def cue(day: str, role: str, weekday: int) -> tuple[array,dict]:
    seed=sound_seed(day,role);rng=random.Random(seed);profile=PROFILES[weekday];seconds=2.0 if role=='intro' else 1.5
    samples=array('f',[0])*round(seconds*RATE);root=profile['root']+12+rng.choice([0,2,5])+{'intro':0,'transition':2,'outro':-2}[role];tones=rng.choice([[0,4,7],[0,3,7],[0,5,9],[0,4,9]])
    for i,interval in enumerate(tones):note(samples,.08+i*.19,1.2,root+interval,.12,profile['voice'])
    return samples,{'role':role,'seed':f'{seed:016x}','profile':profile['name'],'durationSeconds':seconds}

def write_wav(path: Path, samples: array):
    peak=max((abs(x) for x in samples),default=0);gain=min(1,.90/peak) if peak else 1
    pcm=array('h',(round(max(-1,min(1,x*gain))*32767) for x in samples))
    if sys.byteorder!='little':pcm.byteswap()
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(pcm.tobytes())

def library_bed(day: str, role: str, weekday: int, bank: Path, mood: int | None = None):
    """Make a cyclic PCM bed by crossfading the source tail into its head."""
    tracks=sorted(p for p in (bank / str(weekday)).glob('*.wav') if p.is_file())
    if not tracks:
        return None
    rng=random.Random(sound_seed(day,'library-selection'))
    alternatives={1:(1,4),2:(2,5),3:(3,2),4:(4,1),5:(5,2)}
    matches=[i for i,p in enumerate(tracks) if mood in alternatives and p.stem in {f'{n:02d}' for n in alternatives[mood]}]
    index=((rng.choice(matches) if matches else rng.randrange(len(tracks)))+(1 if role=='bed-b' else 0))%len(tracks)
    path=tracks[index]
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar',str(RATE),'-ac','1','-f','s16le','-'])
    pcm=array('h');pcm.frombytes(raw)
    if sys.byteorder!='little':pcm.byteswap()
    if len(pcm)<RATE*8:raise ValueError(f'BGMが短すぎます: {path}')
    overlap=min(RATE*4,len(pcm)//4)
    samples=array('f', (0.0 for _ in range(len(pcm)-overlap)))
    for i in range(overlap):
        mix=i/overlap
        samples[i]=(pcm[len(pcm)-overlap+i]*(1-mix)+pcm[i]*mix)/32768
    for i in range(overlap,len(samples)):
        samples[i]=pcm[i]/32768
    return samples,{'role':role,'source':str(path),'durationSeconds':len(samples)/RATE,'crossfadeSeconds':overlap/RATE}

def run(day: str, source: Path, target: Path, assets: Path, split: float, mood: int | None = None):
    selected=date.fromisoformat(day);weekday=(selected.weekday()+1)%7
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(source)],text=True).strip())
    if not math.isfinite(split) or split<=0 or split>=duration:raise ValueError('台詞の切れ目が不正です。')
    if target.exists() or assets.exists():raise FileExistsError('既存の音声・音素材は上書きしません。')
    assets.mkdir(parents=True);metadata=[]
    remaining=duration-split
    # Use a per-program library if available; preserve production while it is being filled.
    bed_a=min(180.0,max(12.0,math.ceil(split)))
    bed_b=min(180.0,max(12.0,math.ceil(remaining)))
    bank=Path(os.environ.get('RADIO_BGM_DIR',Path(__file__).resolve().parents[1]/'data'/'bgm'))
    bed_lengths=[]
    for role,seconds in [('bed-a',bed_a),('bed-b',bed_b)]:
        picked=library_bed(day,role,weekday,bank,mood)
        samples,info=picked if picked else compose(day,role,seconds,weekday)
        info['generator']='library' if picked else 'procedural-fallback'
        bed_lengths.append(len(samples));write_wav(assets/f'{role}.wav',samples);metadata.append(info)
    for role in ('intro','transition','outro'):
        samples,info=cue(day,role,weekday);write_wav(assets/f'{role}.wav',samples);metadata.append(info)
    second_start=2+split+1.5
    filters=(f'[0:a]asplit=2[s1][s2];[s1]atrim=0:{split:.6f},asetpts=PTS-STARTPTS[a];'
      f'[s2]atrim=start={split:.6f},asetpts=PTS-STARTPTS[b];'
      '[3:a]loudnorm=I=-22:TP=-3:LRA=7,aresample=24000,asetpts=PTS-STARTPTS[intro];'
      '[4:a]loudnorm=I=-22:TP=-3:LRA=7,aresample=24000,asetpts=PTS-STARTPTS[outro];'
      '[5:a]loudnorm=I=-24:TP=-3:LRA=7,aresample=24000,asetpts=PTS-STARTPTS[transition];'
      '[intro][a][transition][b][outro]concat=n=5:v=0:a=1[main];'
      f'[1:a]loudnorm=I=-34:TP=-9:LRA=7,aresample=24000,aloop=loop=-1:size={bed_lengths[0]},atrim=duration={split:.6f},afade=t=in:d=0.8,afade=t=out:st={max(0,split-1):.6f}:d=1,adelay=2000|2000[bed1];'
      f'[2:a]loudnorm=I=-34:TP=-9:LRA=7,aresample=24000,aloop=loop=-1:size={bed_lengths[1]},atrim=duration={remaining:.6f},afade=t=in:d=0.8,afade=t=out:st={max(0,remaining-1):.6f}:d=1,adelay={round(second_start*1000)}|{round(second_start*1000)}[bed2];'
      '[main][bed1][bed2]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.89:level=false[out]')
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-n','-i',str(source)]
    for name in ['bed-a','bed-b','intro','outro','transition']:cmd+=['-i',str(assets/f'{name}.wav')]
    cmd+=['-filter_complex',filters,'-map','[out]','-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','96k',str(target)]
    subprocess.run(cmd,check=True)
    (assets/'sound-manifest.json').write_text(json.dumps({'date':day,'weekday':weekday,'dialogueSplitSeconds':split,'dialogueDurationSeconds':duration,'instrumentalSeconds':0,'assets':metadata},ensure_ascii=False,indent=2)+'\n')

def main():
    p=argparse.ArgumentParser();p.add_argument('--date',required=True);p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--assets',type=Path,required=True);p.add_argument('--split',type=float,required=True);p.add_argument('--mood',type=int,choices=range(1,6))
    args=p.parse_args();run(args.date,args.input,args.output,args.assets,args.split,args.mood)

if __name__=='__main__':main()
