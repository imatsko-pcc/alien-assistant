# Alien Head 3D

A 3D alien head that copies your face. Turn on your webcam and it blinks, smiles, frowns, raises its brow ridges, opens its mouth, puckers, puffs its cheeks and turns its head when you do. Its antennae wobble when you move and glow a different color for each mood (happy, surprised, grumpy, sad, kissy, wink, puffed up).

No camera? It runs a demo of its expressions and follows your mouse.

## Run it

Plain HTML, CSS and JavaScript. No install and no build step.

Browsers only allow the camera on `https://` pages or on `localhost`, so:

- **GitHub Pages (easiest to share):** repo → **Settings** → **Pages** → deploy from the `main` branch, `/ (root)`. Open the link it gives you.
- **VS Code:** install the **Live Server** extension, right-click `index.html` → **Open with Live Server**.
- **Double-click `index.html`:** the demo always works. Chrome usually allows the camera from a local file too; if it doesn't, use one of the options above.

Click **Start camera** and allow access. The first time, the face tracker downloads about 13 MB.

## Controls

| Button | What it does |
| --- | --- |
| **Start / Stop camera** | Turns face tracking on or off |
| **Mirror** | On: the alien acts like your reflection (wink your left eye, its eye on the left closes). Off: it faces you like another person would |
| **Preview** | Shows your camera picture in the corner |

## Privacy

Your video never leaves your computer. Face tracking runs inside the browser with WebAssembly. The page only downloads the tracking library and model; it never uploads anything.

## How it works

- **Face tracking (`js/face-tracker.js`)**: [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) gives 52 expression scores per frame (`eyeBlinkLeft`, `mouthSmileRight`, `jawOpen`, `browInnerUp`, ...) plus a head-pose matrix. Instead of trusting which side "Left" means, it checks the blink scores against how open each eye actually is in the picture.
- **Mapping (`js/main.js`)**: turns those scores into the alien's expression channels and head turn, flipping sides for mirror mode, and picks a mood from them.
- **The alien (`js/alien-head.js`)**: built from [three.js](https://threejs.org) shapes. The skull is a stretched sphere, the eyes are squashed to blink, and the lips are rebuilt every frame from the expression. Everything is smoothed so it moves naturally.

## Project structure

```
index.html            page and buttons
css/style.css         styles
js/alien-head.js      the 3D alien and its expressions
js/face-tracker.js    webcam + MediaPipe face tracking
js/main.js            scene, demo mode, face-to-alien mapping
```
