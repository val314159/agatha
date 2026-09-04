import os
import re
import json
import torch
import librosa
import soundfile
import torchaudio
import numpy as np
import torch.nn as nn
from tqdm import tqdm
import torch

from . import utils
from . import commons
from .models import SynthesizerTrn
from .split_utils import split_sentence
from .mel_processing import spectrogram_torch, spectrogram_torch_conv
from .download_utils import load_or_download_config, load_or_download_model

def extract_and_replace(text, pattern = re.compile(r"(<<[^<>]+>>)|(\[\[[^\[\]]+\]\])")):
    tags = []
    def replacer(match):
        tag = next(g for g in match.groups() if g is not None)
        tags.append(tag)
        return "{{{{tag}}}}"
        return ""
    result = pattern.sub(replacer, text)
    return tags, result

class TTS(nn.Module):
    def __init__(self, 
                language,
                device='auto',
                use_hf=True,
                config_path=None,
                ckpt_path=None):
        super().__init__()
        if device == 'auto':
            device = 'cpu'
            if torch.cuda.is_available(): device = 'cuda'
            if torch.backends.mps.is_available(): device = 'mps'
        if 'cuda' in device:
            assert torch.cuda.is_available()

        # config_path = 
        hps = load_or_download_config(language, use_hf=use_hf, config_path=config_path)

        num_languages = hps.num_languages
        num_tones = hps.num_tones
        symbols = hps.symbols

        model = SynthesizerTrn(
            len(symbols),
            hps.data.filter_length // 2 + 1,
            hps.train.segment_size // hps.data.hop_length,
            n_speakers=hps.data.n_speakers,
            num_tones=num_tones,
            num_languages=num_languages,
            **hps.model,
        ).to(device)

        model.eval()
        self.model = model
        self.symbol_to_id = {s: i for i, s in enumerate(symbols)}
        self.hps = hps
        self.device = device
    
        # load state_dict
        checkpoint_dict = load_or_download_model(language, device, use_hf=use_hf, ckpt_path=ckpt_path)
        self.model.load_state_dict(checkpoint_dict['model'], strict=True)
        
        language = language.split('_')[0]
        self.language = 'ZH_MIX_EN' if language == 'ZH' else language # we support a ZH_MIX_EN model

    @staticmethod
    def audio_numpy_concat(segment_data_list, sr, speed=1., end_pause=0.05):
        audio_segments = []
        for segment_data in segment_data_list:
            audio_segments += segment_data.reshape(-1).tolist()
            audio_segments += [0] * int((sr * end_pause) / speed)
        audio_segments = np.array(audio_segments).astype(np.float32)
        return audio_segments

    @staticmethod
    def split_sentences_into_pieces(text, language, quiet=False):
        texts = split_sentence(text, language_str=language)
        if not quiet:
            print(" > Text split to sentences.")
            print('\n'.join(texts))
            print(" > ===========================")
        return texts

    def tts_to_file(self, text, speaker_id, output_path=None, sdp_ratio=0.2, noise_scale=0.6, noise_scale_w=0.8, speed=1.0, pbar=None, format=None, position=None, quiet=False,):
        language = self.language
        texts = self.split_sentences_into_pieces(text, language, quiet)
        audio_list = []
        if pbar:
            tx = pbar(texts)
        else:
            if position:
                tx = tqdm(texts, position=position)
            elif quiet:
                tx = texts
            else:
                tx = tqdm(texts)
        for t in tx:
            if language in ['EN', 'ZH_MIX_EN']:
                t = re.sub(r'([a-z])([A-Z])', r'\1 \2', t)
            device = self.device
            bert, ja_bert, phones, tones, lang_ids = utils.get_text_for_tts_infer(t, language, self.hps, device, self.symbol_to_id)
            with torch.no_grad():
                x_tst = phones.to(device).unsqueeze(0)
                tones = tones.to(device).unsqueeze(0)
                lang_ids = lang_ids.to(device).unsqueeze(0)
                bert = bert.to(device).unsqueeze(0)
                ja_bert = ja_bert.to(device).unsqueeze(0)
                x_tst_lengths = torch.LongTensor([phones.size(0)]).to(device)
                del phones
                speakers = torch.LongTensor([speaker_id]).to(device)
                audio = self.model.infer(
                        x_tst,
                        x_tst_lengths,
                        speakers,
                        tones,
                        lang_ids,
                        bert,
                        ja_bert,
                        sdp_ratio=sdp_ratio,
                        noise_scale=noise_scale,
                        noise_scale_w=noise_scale_w,
                        length_scale=1. / speed,
                    )[0][0, 0].data.cpu().float().numpy()
                del x_tst, tones, lang_ids, bert, ja_bert, x_tst_lengths, speakers
                # 
            audio_list.append(audio)
        torch.cuda.empty_cache()
        audio = self.audio_numpy_concat(audio_list, sr=self.hps.data.sampling_rate, speed=speed)

        if output_path is None:
            return audio
        else:
            if format:
                soundfile.write(output_path, audio, self.hps.data.sampling_rate, format=format)
            else:
                soundfile.write(output_path, audio, self.hps.data.sampling_rate)


    def tts_iter(self, text, speaker_id, sdp_ratio=0.2, noise_scale=0.6, noise_scale_w=0.8, speed=1.0, pbar=None, format=None, position=None, quiet=False,):
        language = self.language
        print("TEXT1", repr(text))
        tags, result = extract_and_replace(text)
        print("TEXT2", repr(tags))
        print("TEXT3", repr(result))
        texts = self.split_sentences_into_pieces(result, language, quiet)
        print("TEXTS", repr(texts))
        audio_list = []
        if pbar:
            tx = pbar(texts)
        else:
            if position:
                tx = tqdm(texts, position=position)
            elif quiet:
                tx = texts
            else:
                tx = tqdm(texts)
                pass
            pass
        
        hop = self.hps.data.hop_length
        sr = self.hps.data.sampling_rate
        frame_ms = hop * 1000.0 / sr
        frame_us = round(hop * 1000000.0 / sr)
        for t in tx:
            if language in ['EN', 'ZH_MIX_EN']:
                t = re.sub(r'([a-z])([A-Z])', r'\1 \2', t)
                pass
            device = self.device
            print("T", repr(t))
            bert, ja_bert, phones, tones, lang_ids = utils.get_text_for_tts_infer(t, language, self.hps, device, self.symbol_to_id)
            with torch.no_grad():  
                x_tst = phones.to(device).unsqueeze(0)
                tones = tones.to(device).unsqueeze(0)
                lang_ids = lang_ids.to(device).unsqueeze(0)
                bert = bert.to(device).unsqueeze(0)
                ja_bert = ja_bert.to(device).unsqueeze(0)
                x_tst_lengths = torch.LongTensor([phones.size(0)]).to(device)
                del phones
                speakers = torch.LongTensor([speaker_id]).to(device)
                aud, attn, _, _ = self.model.infer(
                    x_tst,
                    x_tst_lengths,
                    speakers,
                    tones,
                    lang_ids,
                    bert,
                    ja_bert,
                    sdp_ratio=sdp_ratio,
                    noise_scale=noise_scale,
                    noise_scale_w=noise_scale_w,
                    length_scale=1. / speed,
                )
                dur = attn.sum(dim=2)[0, 0].long()                
                # start_frames[j] = sum_{k < j} dur[k]
                start_frames = torch.cat([
                    torch.zeros(1, device=dur.device, dtype=dur.dtype),
                    torch.cumsum(dur[:-1], dim=0)
                ])
                from .text.english import get_phoneme_list
                pl = get_phoneme_list()
                for i, info in enumerate(pl):
                    slot_j = 2 * i + 1
                    if slot_j >= dur.numel():
                        break  # past the extra final blank
                    duration = dur[slot_j].item()
                    start = start_frames[slot_j].item()
                    # info is either None (sentinels) or {'phoneme': ..., 'tone': ..., 'word': ...}
                    if info:
                        # OLD FOR COMPATIBILITY: keeping old field names for backward compatibility
                        info['duration_ms'] = round(duration * frame_ms)
                        info['start_ms'] = round(start * frame_ms)
                        info['end_ms'] = round((start + duration) * frame_ms)

                        info['duration_us'] = duration * frame_us
                        info['start_us'] = start * frame_us
                        info['end_us'] = (start + duration) * frame_us
                        pass
                    pass
                end_of_utterance_slots = (dur[-1] * hop).item()
                audio = aud[0, 0].data.cpu().float().numpy().astype(np.float32)
                audio2 = audio[:-end_of_utterance_slots]
                audio3 = self.audio_numpy_concat([audio2], sr=sr, speed=speed, end_pause=0)
                #from pprint import pprint
                #print("PL1")
                #pprint(pl)               
                def alter(x):
                    tag_count = x.pop('tag_count')
                    tag_list = []
                    for t in range(tag_count):
                        #print("ITS A COUNT")
                        tag_list.append(tags.pop(0))
                        pass
                    if tag_list:
                        x['tags'] = tag_list
                        pass
                    if not x['word']:
                        x.pop('word')
                        pass
                    return x
                pl2 = [alter(x) for x in pl if x]
                #print("PL2")
                #pprint(pl2)
                yield audio3, pl2

                del x_tst, tones, lang_ids, bert, ja_bert, x_tst_lengths, speakers
                #
                pass
            pass

        torch.cuda.empty_cache()


