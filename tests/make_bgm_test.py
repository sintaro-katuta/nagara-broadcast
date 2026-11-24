import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('maker',Path(__file__).resolve().parents[1]/'scripts/make-bgm.py')
maker=importlib.util.module_from_spec(spec);spec.loader.exec_module(maker)

class TestMaker(unittest.TestCase):
    def test_generates_in_unique_candidate_folder_without_touching_live_music(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);python=root/'data/ace-step/.venv/bin/python';python.parent.mkdir(parents=True);python.touch()
            for relative in ('acestep-v15-turbo/model.safetensors','vae/diffusion_pytorch_model.safetensors','Qwen3-Embedding-0.6B/model.safetensors'):
                model=root/'data/ace-step/checkpoints'/relative;model.parent.mkdir(parents=True,exist_ok=True);model.write_bytes(b'x'*1025)
            live=root/'data/bgm/1';live.mkdir(parents=True);(live/'01.wav').write_text('original')
            calls=[]
            def run(cmd,**kwargs):
                calls.append(cmd)
                class Result:returncode=0
                return Result()
            with patch.object(maker,'ROOT',root),patch.object(sys,'argv',['make-bgm','--day','月','--count','2','--duration','30','--prompt','steady rhythm']),patch.object(maker.subprocess,'run',side_effect=run),contextlib.redirect_stdout(io.StringIO()):
                maker.main();maker.main()
            self.assertEqual((live/'01.wav').read_text(),'original')
            self.assertEqual(len(list((root/'data/bgm-candidates').iterdir())),2)
            self.assertEqual(calls[0][calls[0].index('--weekday')+1],'1')
            self.assertEqual(calls[0][calls[0].index('--prompt')+1],'steady rhythm')

if __name__=='__main__':unittest.main()
