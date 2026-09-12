"""Hand-selected attacks from the downloaded First Light waveform.

Positions use the 10 ms high-band RMS attack envelope, inspected against the
recording. Off-beat drum accents are retained; cuts aren't inferred from BPM.
Source playback remains at its original speed.
"""
SOURCE_CUES = (12.931, 15.008, 18.690, 22.383, 26.075,
               29.781, 33.461, 37.151, 40.843)
SOURCE_START = SOURCE_CUES[0]
MUSIC_CUE_FRAMES = tuple(round((t-SOURCE_START)*60) for t in SOURCE_CUES)
OUTRO_EXTRA_FRAMES = 120
CUT_FRAMES = MUSIC_CUE_FRAMES[:-1]+(MUSIC_CUE_FRAMES[-1]+OUTRO_EXTRA_FRAMES,)
CUT_TIMES = tuple(frame/60 for frame in CUT_FRAMES)
FRAMES = CUT_FRAMES[-1]


def timing_verification():
    errors = [abs(frame/60-(cue-SOURCE_START))*1000
              for frame, cue in zip(MUSIC_CUE_FRAMES, SOURCE_CUES)]
    assert max(errors) <= 1000/120
    assert all(b > a for a, b in zip(CUT_FRAMES, CUT_FRAMES[1:]))
    return {'source_cues_seconds': SOURCE_CUES, 'music_cue_frames': MUSIC_CUE_FRAMES,
            'cut_frames': CUT_FRAMES, 'outro_extra_seconds': OUTRO_EXTRA_FRAMES/60,
            'max_attack_alignment_error_ms': round(max(errors), 3),
            'music_playback_rate': 1.0}
