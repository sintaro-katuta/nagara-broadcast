"""Render short music auditions; does not access or publish radio episodes."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import date,timedelta

here=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('weekly_sound',here/'weekly-sound.py')
music=importlib.util.module_from_spec(spec);spec.loader.exec_module(music)
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
start=date.fromisoformat('2026-11-02')
for index in range(7):
    day=start+timedelta(days=index);weekday=(day.weekday()+1)%7
    samples,_=music.compose(day.isoformat(),'song',14,weekday)
    with tempfile.TemporaryDirectory() as temp:
        wav=Path(temp)/'audition.wav';music.write_wav(wav,samples)
        dest=out/f'{index+1}-{day.isoformat()}.mp3'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-n','-i',str(wav),'-af','loudnorm=I=-18:TP=-2:LRA=7','-c:a','libmp3lame','-b:a','128k',str(dest)],check=True)
    print(f'{day} {music.PROFILES[weekday]["name"]}: {dest}',flush=True)
