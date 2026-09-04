#!/usr/bin/python3
import sys, time, numpy as np, soundfile as sf

language = 'EN'
speaker = 'EN-AU'
text = ' '.join(sys.argv[1:]) or\
    "Hi  there.  <<smile>> welcome. [[wave]] Did you ever hear a folk tale about a giant turtle?"
#"Hi there.   |smile|   welcome. |wave|  Did you ever hear a folk tale about a giant turtle?"
#    "Hi there.  welcome.  Did you, ever hear a folk tale about a giant turtle?"

text='''
The Roman Empire was a vast, powerful state that lasted for over a thousand years, from 27 B.C. to 1453 A.D.. It grew from a small city-state into a huge empire controlling much of Europe, North Africa, and the Middle East. Initially ruled as a republic, it became an empire after the rise of its first emperor, Augustus, following a period of civil war. The empire was eventually split into the Western Roman Empire, which fell in 476 A.D., and the Eastern Roman Empire (also known as the Byzantine Empire), which survived until 1453 A.D..
Timeline: The Roman Empire is traditionally dated from 27 B.C. to 476 A.D. for the unified period, with the Western Empire ending in 476 A.D. and the Eastern Empire continuing until 1453 A.D..
Territory: At its peak, it encompassed territories from Britain to the Middle East, including most of continental Europe, northern Africa, and the Mediterranean islands.
Capital: Rome was the original capital, but the empire became too large to manage from one city and was later split, with the Eastern Empire centered in Constantinople.
Government: It was ruled by emperors and, at its height, was a centralized autocracy, though it incorporated elements of its previous republican structure.
Legacies: The Roman Empire left a lasting legacy, including the development of the Latin-based Romance languages, the modern Western alphabet and calendar, and the spread of Christianity.
Key figure: Augustus became the first emperor, ushering in a long period of peace and prosperity known as the Pax Romana.
Fall: The Western Roman Empire collapsed due to factors such as the weakness of the army, economic issues, and internal political struggles. However, the Eastern Roman Empire (Byzantine Empire) continued for <<smiles>> nearly [[bows]] another thousand years.
'''

print("TEXT", speaker, repr(text))

#text2 = re.findall(r"\|[^\|]+\|", text)
#text2 = re.findall(r"⟦[^⟧]+⟧|⟪[^⟫]+⟫", text)

#print("TEX2", speaker, repr(text2))


#exit(1)


from melo.api import TTS

print("...")

# CPU is sufficient for real-time inference.
# You can set it manually to 'cpu' or 'cuda' or 'cuda:0' or 'mps'
#device = 'cpu' # Will automatically use GPU if available
#device = 'auto' # Will automatically use GPU if available
device = 'cuda'

tts = TTS(language='EN', device=device)

speaker_id = tts.hps.data.spk2id[speaker]

leaf = 'out'

output_path = leaf + '.wav'
timing_path = leaf + '.jsonp'

#t1 = time.time()
#tts.tts_to_file(text, speaker_id, output_path)
#t2 = time.time()

#print(f'generation time: {(t2-t1):.2}s')

sr = tts.hps.data.sampling_rate

import json

t1 = time.time()
iter = tts.tts_iter(text, speaker_id)

with sf.SoundFile(output_path, "w", samplerate=sr, channels=1) as fa:
    with open(timing_path, "w") as fj:
        for audio, word_dur in iter:
            #exit()
            ms = audio.shape[0] / sr * 1000
            print(f"{ms:.2f} ms")

            j = json.dumps(word_dur) + '\n'
            fj.write(j)
            fj.flush()

            #fa.seek(0, whence=2)  # move to end
            fa.write(audio)
            fa.flush()


t2 = time.time()
print(f'iteration time: {(t2-t1):.2}s')
