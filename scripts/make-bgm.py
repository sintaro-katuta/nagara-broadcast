#!/usr/bin/env python3
"""Create reviewable ACE-Step background music candidates without replacing the live library."""
import argparse
from datetime import datetime
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parent.parent
DAYS={'日':0,'日曜':0,'日曜日':0,'月':1,'月曜':1,'月曜日':1,'火':2,'火曜':2,'火曜日':2,'水':3,'水曜':3,'水曜日':3,'木':4,'木曜':4,'木曜日':4,'金':5,'金曜':5,'金曜日':5,'土':6,'土曜':6,'土曜日':6}

def main():
    parser=argparse.ArgumentParser(description='曜日に合わせた試聴用 BGM を生成します。既存の番組音源は変更しません。')
    parser.add_argument('--day',required=True,choices=DAYS,help='例: 月、火、水')
    parser.add_argument('--count',type=int,choices=range(1,6),default=1,help='生成する曲数（1〜5、既定1）')
    parser.add_argument('--duration',type=int,default=90,help='曲の秒数（20〜180、既定90）')
    parser.add_argument('--prompt',default='',help='追加する曲調の希望。英語推奨')
    args=parser.parse_args()
    if not 20<=args.duration<=180:parser.error('曲の秒数は20〜180を指定してください。')
    ace=ROOT/'data'/'ace-step'
    python=ace/'.venv'/'bin'/'python'
    required=[ace/'checkpoints'/'acestep-v15-turbo'/'model.safetensors',ace/'checkpoints'/'vae'/'diffusion_pytorch_model.safetensors',ace/'checkpoints'/'Qwen3-Embedding-0.6B'/'model.safetensors']
    if not python.exists() or not all(p.is_file() and p.stat().st_size>1024 for p in required):
        raise SystemExit('ACE-Step の環境またはモデルが見つかりません。セットアップ手順を確認してください。')
    base=ROOT/'data'/'bgm-candidates';base.mkdir(parents=True,exist_ok=True)
    folder=Path(tempfile.mkdtemp(prefix=datetime.now().strftime('%Y%m%d-%H%M%S-'),dir=base))
    env=os.environ.copy();env.update({'HF_HUB_OFFLINE':'1','TOKENIZERS_PARALLELISM':'false','HF_HOME':str(ROOT/'data'/'ace-hf'),'MPLCONFIGDIR':str(ROOT/'data'/'ace-matplotlib')})
    cmd=[str(python),str(ROOT/'scripts'/'generate-bgm-library.py'),'--ace-root',str(ace),'--bank',str(folder),'--weekday',str(DAYS[args.day]),'--duration',str(args.duration),'--count',str(args.count),'--prompt',args.prompt]
    print(f'試聴用の保存先: {folder}',flush=True)
    result=subprocess.run(cmd,cwd=ace,env=env)
    if result.returncode:raise SystemExit(result.returncode)
    for path in sorted((folder/str(DAYS[args.day])).glob('[0-9][0-9].wav')):print(f'生成完了: {path}',flush=True)

if __name__=='__main__':main()
