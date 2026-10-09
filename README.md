# YA RADOM

A 31-second, audio-synchronised illustrated anime edit. Static HTML, CSS and JavaScript; no build step, CDN scripts, framework or API key. `chorus.mp3` is the original repository audio.

## Run / deploy

Serve the repository root, for example `python -m http.server 8080`, then open `http://localhost:8080`. On Vercel use **Other**, no build command, root output directory. Keep `assets/`, `index.html`, `style.css`, `edit.js` and `chorus.mp3` together.

## Edit direction

Three original illustrated scenes, 19 camera shots and 12 typography cues form a short narrative: rainy separation → summer promise → fragments of memory → silence. This is an animated illustration edit, not sourced anime video footage. Typography uses short phrase compositions, outline contrast and directional arrivals. Only selected music accents trigger a short push, echo and low-opacity flash; quiet passages are allowed to breathe.

`edit.js` contains `cues`, `shots` and `beats`. Existing lyric timings and onset markers are retained; two long phrases have additional editorial splits. Adjust these arrays if the vocal phrasing needs finer alignment. All animation is a pure sample of `audio.currentTime`: paused seeks, replay and backward seeks reconstruct the exact frame without queued animations.

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
