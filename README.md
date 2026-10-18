# YA RADOM

A 31-second, audio-synchronised illustrated anime edit. Static HTML, CSS and JavaScript; no build step, CDN scripts, framework or API key. `chorus.mp3` is the original repository audio.

## Run / deploy

Serve the repository root, for example `python -m http.server 8080`, then open `http://localhost:8080`. On Vercel use **Other**, no build command, root output directory. Keep `assets/`, `index.html`, `style.css`, `edit.js` and `chorus.mp3` together.

## Edit direction

Aggressive AMV-style edit built from three original illustrations: 66 cuts on a measured beat grid (123 BPM, first beat at 0.025 s), 19 framings of the three images, mirrored shots, mono/red/invert looks, black strobe frames, zoom and whip entrances, per-beat camera punch and shake, RGB channel split and white flashes. Lyrics slam in word by word.

`edit.js` is the timeline:
- `LEVELS` — intensity of each bar (1 calm … 3 maximum).
- `FRAMINGS` — image + focus point + zoom.
- `SHOTS` — `[beat, framing, tags]`; beats can be fractional (`.5` = off-beat).
- `LINES` — lyric lines; line start times are kept from the previous version and were not re-checked by ear.

The camera is drawn on a `<canvas>`; red/cyan channel copies are prepared once per image so the RGB split costs two `drawImage` calls per frame. All animation is a pure sample of `audio.currentTime`: paused seeks, replay and backward seeks reconstruct the exact frame.

The edit contains flashes and inverted frames; the FX toggle and the reduced-motion preference turn them off.

## Controls / mobile

- Tap the opening button to unlock audio; no autoplay is assumed.
- Play/pause, seek, replay, mute and FX toggle. Desktop fullscreen when supported.
- Space plays/pauses; left/right arrows seek five seconds (native focused controls keep their own keyboard behaviour).
- Switching tabs pauses playback. Returning keeps the paused position.
- Reduced-motion preference disables camera motion, word reveals, flash and particles. FX can also be switched off manually.
- Safe-area insets, small-screen type fitting, limited canvas pixel ratio and no idle animation loop.

## Art

Original assets were generated with the built-in image generation tool and converted to WebP for delivery (~583 KiB total):

- `assets/platform.webp`: widescreen hand-drawn anime still, lonely dark-haired young adult in profile at a rainy Japanese railway platform, navy/lavender dusk, pink signal lights, negative space for type.
- `assets/eyes.webp`: widescreen close-up of a young adult woman's wistful violet-grey eye, rain on cheek, dark windblown hair, blurred lavender/rose night-city lights.
- `assets/summer.webp`: widescreen hand-painted summer-memory scene, two young adults on a grassy hill under luminous lilac/peach evening clouds, distant town and crescent moon.

All prompts specified no text, logo or border. No external image services are contacted at runtime.

## Validation

`node tests/playback.cjs` runs a browser regression check (Playwright must be available; optional `CHROMIUM_PATH`). Verified in headless Chromium: actual audio playback, paused-frame stability, deterministic forward/backward seeks, all 12 cues without overflow at 320/390/1440 px, reduced motion, mute, end screen and replay. Desktop and mobile screenshots reviewed. Real iPhone Safari / WebKit verification remains outstanding.
