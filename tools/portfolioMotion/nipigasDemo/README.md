# Nipigas presentation sources

Run `node tools/portfolioMotion/nipigasDemo/serve.mjs` from DigitalMonsterPRO.

- New Year: <http://localhost:5186/express>, <http://localhost:5186/wishes>.
- 50th anniversary: <http://localhost:5187>.
- Originals stay in `C:/websites/archive/Лена/nipigas-newyear.ru` and `C:/websites/archive/Лена/nipigas50.local`; the server does not write to either archive.

The New Year API is a local, in-memory stand-in with fictional names, wishes, stories and scores. It uses the six original selectable avatar illustrations and the site's own regional videos. No account, message, file or like is sent to the former backend. Reloading restores the demo data. All 52 original tree positions are populated; a new wish replaces the oldest visible wish.

Supported paths: profile/avatar, regional scoring and videos, leaderboard filters, xylophone, quiz, Secret Santa wheel/result, wish reading/submission, stories, regional chat and video contest likes/upload preview. Uploads use local object URLs and have no server persistence.

## Capture

Append `?capture=1` before loading a capture page to enable the clock. F8 pauses/resumes original JS and CSS animation time. F9 advances exactly 1/60 second. Save a browser screenshot after each step. No recording controls are drawn over the source site. Ordinary demo visits retain the native browser clock.

The PNG sequences in `output/showreels/nipigas/sources/expanded` were captured from real browser rendering at 60 samples per second, with the original handlers/styles. Native embedded video playback is not controlled by this clock; the contest uses paused original frames, and the regional video appears as a still. Do not describe these as new 60 fps regional video recordings.

The film uses the calendar's existing native assets, the anniversary intro and orbital section reveal, history/projects, the New Year map and region opening, xylophone playback, quiz advance, full wheel spin/result, 52-avatar tree, desktop/mobile wishes, stories, leaderboard, chat and contest like feedback. Responsive views were captured at 430 × 932. Screens are reduced in size, never enlarged past their original pixel resolution.

## Render and checks

`python -B tools/portfolioMotion/nipigasExpanded.py --inspect`

`python -B tools/portfolioMotion/nipigasExpanded.py --ffmpeg <ffmpeg.exe> --part <0..7>`

`python -B tools/portfolioMotion/nipigasExpanded.py --ffmpeg <ffmpeg.exe> --assemble`

`python -B tools/portfolioMotion/nipigasExpanded.py --install` copies only the validated Nipigas exports and updates the review manifest; production URLs are in `src/pages/portfolio/data/filmProjects.js`.

`node --test tools/portfolioMotion/nipigasDemo/mockApi.test.mjs`

The v11 film is 104 seconds, 1920 × 1080 / 960 × 540, 60 fps. It uses the user-selected First Light / Infraction (`TpZwt4w9TnM`) at the previous v10 background level: music gain −30.02 dB after −18 LUFS normalization, card movement at one-third gain, wave ambience at 0.05 gain. No external HUD or captions are added. It has a settled ending followed by a soft visual/audio fade.

`nipigasExpanded.py` only renders Nipigas. The older seven-project `presentationMusic.py` batch describes the archived v10 cut and must not be used to overwrite the expanded v11 film.
