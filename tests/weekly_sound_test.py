import importlib.util
import math
from pathlib import Path
import subprocess
import tempfile
import unittest
from array import array

spec=importlib.util.spec_from_file_location('weekly_sound',Path(__file__).resolve().parents[1]/'scripts/weekly-sound.py')
sound=importlib.util.module_from_spec(spec);spec.loader.exec_module(sound)

def amplitude_at(samples, frequency):
    # Projection onto the tone verifies that both different voices remain audible.
    step=2*math.pi*frequency/sound.RATE
    a=sum(x*math.cos(i*step) for i,x in enumerate(samples))
    b=sum(x*math.sin(i*step) for i,x in enumerate(samples))
    return math.hypot(a,b)/len(samples)

class WeeklySoundTest(unittest.TestCase):
    def test_daily_seeds_are_reproducible_and_change_with_date_and_role(self):
        a,meta=sound.compose('2026-11-02','bed-a',2,1)
        b,_=sound.compose('2026-11-02','bed-a',2,1)
        c,_=sound.compose('2026-11-09','bed-a',2,1)
        self.assertEqual(a,b)
        self.assertNotEqual(a,c)
        self.assertNotEqual(sound.sound_seed('2026-11-02','bed-a'),sound.sound_seed('2026-11-02','bed-b'))
        self.assertEqual(meta['profile'],sound.PROFILES[1]['name'])
        self.assertEqual(len(sound.PROFILES),7)

    def test_full_mix_keeps_both_speech_sections_without_a_music_break(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'voice.wav';result=root/'mix.mp3';assets=root/'assets'
            first=array('f',(0.2*math.sin(2*math.pi*440*i/sound.RATE) for i in range(sound.RATE*3)))
            second=array('f',(0.2*math.sin(2*math.pi*660*i/sound.RATE) for i in range(sound.RATE*3)))
            sound.write_wav(source,first+second)
            sound.run('2026-11-03',source,result,assets,3.0)
            duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(result)],text=True))
            self.assertAlmostEqual(duration,11,delta=.15)
            raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(result),'-f','s16le','-ar','24000','-ac','1','-'])
            pcm=array('h');pcm.frombytes(raw)
            first_tone=pcm[round(2.4*sound.RATE):round(4.4*sound.RATE)]
            second_tone=pcm[round(6.9*sound.RATE):round(8.9*sound.RATE)]
            self.assertGreater(amplitude_at(first_tone,440),amplitude_at(first_tone,660)*5)
            self.assertGreater(amplitude_at(second_tone,660),amplitude_at(second_tone,440)*5)
            self.assertTrue((assets/'sound-manifest.json').exists())
            self.assertEqual(len(list(assets.glob('*.wav'))),5)

    def test_library_bed_crossfades_and_selects_deterministically(self):
        with tempfile.TemporaryDirectory() as folder:
            bank=Path(folder);(bank/'1').mkdir()
            source=array('f',(0.2*math.sin(2*math.pi*440*i/sound.RATE) for i in range(sound.RATE*10)))
            sound.write_wav(bank/'1'/'track.wav',source)
            a,info=sound.library_bed('2026-11-02','bed-a',1,bank)
            b,_=sound.library_bed('2026-11-02','bed-a',1,bank)
            self.assertEqual(a,b)
            self.assertEqual(info['crossfadeSeconds'],2.5)
            self.assertLess(abs(a[0]-a[-1]),.1)

    def test_library_respects_available_mood_and_uses_different_second_track(self):
        with tempfile.TemporaryDirectory() as folder:
            bank=Path(folder);(bank/'1').mkdir()
            source=array('f',(0.2*math.sin(2*math.pi*440*i/sound.RATE) for i in range(sound.RATE*8)))
            for name in ('02.wav','04.wav'):sound.write_wav(bank/'1'/name,source)
            _,first=sound.library_bed('2026-11-02','bed-a',1,bank,4)
            _,second=sound.library_bed('2026-11-02','bed-b',1,bank,4)
            self.assertEqual(Path(first['source']).name,'04.wav')
            self.assertNotEqual(first['source'],second['source'])

if __name__=='__main__':unittest.main()
