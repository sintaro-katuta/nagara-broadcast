"""Generate reusable program beds using an installed ACE-Step 1.5 environment."""
import argparse
import json
from pathlib import Path
import shutil

STYLES = {
    0: 'quiet reflective Sunday evening, sparse intimate solo piano and subtle legato string quartet, spacious melancholy and warm restraint, no drums, no jazz rhythm',
    1: 'Playful acoustic chamber music, prominent solo wooden marimba plays a simple cheerful melody with soft pizzicato strings, sparse and light, steady walking pulse, no drums, no drum kit, no guitars, no electric instruments, no synths',
    2: 'Energetic instrumental rock band with prominent crunchy electric guitar power chords, electric bass and live drum kit playing a simple steady straight 8 beat, uplifting and earthy, no marimba, no xylophone, no bells, no strings, no acoustic instruments',
    3: 'intimate jazz cafe trio, jazzy piano chords and improvised piano, warm upright double bass and soft brushed jazz drum kit, sophisticated swing, no guitar or synthesizers',
    4: 'playful technology discovery show, electronic music, analog synthesizer arpeggios and digital bleeps, soft electronic drum machine, creative quirky futuristic, no acoustic guitar or jazz piano',
    5: 'bright funky lifestyle show, syncopated electric bass groove, crisp rhythm guitar and electric keyboard, disco funk drum groove, upbeat Friday afternoon, no jazz swing',
    6: 'nostalgic cozy Japanese veranda, gentle acoustic fingerpicked guitar and expressive harmonica, folky storytelling warmth, very sparse percussion, no synthesizer or jazz piano',
}
MOODS = ['bright and light', 'gentle and calm', 'warm and conversational', 'curious and playful', 'thoughtful and relaxed']

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ace-root',required=True,type=Path)
    parser.add_argument('--bank',required=True,type=Path)
    parser.add_argument('--weekday',type=int,choices=range(7),action='append')
    parser.add_argument('--duration',type=int,default=90)
    parser.add_argument('--count',type=int,choices=range(1,6),default=5)
    parser.add_argument('--prompt',default='',help='番組別設定に追加する曲の希望')
    args=parser.parse_args()
    if not 20 <= args.duration <= 180:parser.error('duration must be 20–180 seconds')
    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationParams, GenerationConfig, generate_music
    handler=AceStepHandler()
    status,ok=handler.initialize_service(project_root=str(args.ace_root.resolve()),config_path='acestep-v15-turbo',device='mps',offload_to_cpu=True,use_mlx_dit=True)
    print(status,flush=True)
    if not ok:raise SystemExit(1)
    for weekday in args.weekday or range(7):
        folder=args.bank / str(weekday);folder.mkdir(parents=True,exist_ok=True)
        for i,mood in enumerate(MOODS[:args.count],1):
            destination=folder/f'{i:02d}.wav'
            if destination.exists():
                print(f'skip {destination}',flush=True);continue
            caption=f'Instrumental background music for a Japanese radio talk show: {STYLES[weekday]}, {mood}, {args.prompt}, understated, steady tempo, no voice, no singing, no spoken words, loop friendly'
            params=GenerationParams(caption=caption,lyrics='[Instrumental]',duration=args.duration,thinking=False,use_cot_caption=False,use_cot_metas=False,use_cot_language=False,inference_steps=8)
            generated_dir=folder/'.generated';generated_dir.mkdir(exist_ok=True)
            result=generate_music(handler,None,params,GenerationConfig(batch_size=1,audio_format='wav'),save_dir=str(generated_dir))
            if not result.success:raise RuntimeError(result.error)
            generated=Path(result.audios[0]['path'])
            # Do not replace an existing recording if another producer is running.
            with generated.open('rb') as src, destination.open('xb') as dst:shutil.copyfileobj(src,dst)
            (folder/f'{i:02d}.json').write_text(json.dumps({'caption':caption,'duration':args.duration,'source':str(generated.name)},ensure_ascii=False,indent=2)+'\n')
            print(f'created {destination}',flush=True)

if __name__=='__main__':main()
