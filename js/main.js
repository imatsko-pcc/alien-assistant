/*
 * Alien Head 3D — scene, camera button, and turning face data into
 * alien expressions. Without a camera the alien runs a demo and follows
 * the mouse.
 */
(function () {
  'use strict';

  const T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Scene ----------
  const canvas = $('scene');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.1, 200);

  scene.add(new T.HemisphereLight(0xcffafe, 0x1e1b4b, 1.1));
  const key = new T.DirectionalLight(0xffffff, 2.6);
  key.position.set(-2.5, 3, 4);
  scene.add(key);
  const rim = new T.DirectionalLight(0x67e8f9, 3);
  rim.position.set(3, 1.5, -3);
  scene.add(rim);
  const rim2 = new T.DirectionalLight(0xa855f7, 2);
  rim2.position.set(-3, -1, -2.5);
  scene.add(rim2);

  (function stars() {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 30 + Math.random() * 40, s = Math.sqrt(1 - u * u);
      pos.set([s * Math.cos(t) * r, u * r, -Math.abs(s * Math.sin(t) * r) - 10], i * 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    scene.add(new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.8 })));
  })();

  const alien = new window.AlienHead(scene);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit about 4.6 units of height, or 3.8 of width on narrow screens
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(2.3 / half, 1.9 / (half * camera.aspect));
    camera.position.set(0, 0.2, dist);
    camera.lookAt(0, 0.25, 0);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Settings ----------
  function load(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* storage off */ } }
  let mirror = load('alienMirror', true);
  let preview = load('alienPreview', false);

  // ---------- Face data -> alien expression ----------
  const eul = new T.Euler(0, 0, 0, 'YXZ');
  const mat = new T.Matrix4();
  const quat = new T.Quaternion();
  const v1 = new T.Vector3(), v2 = new T.Vector3();

  function fromFace(face) {
    const s = face.shapes;
    const g = (n) => s[n] || 0;
    // The person's own [left, right] value for a blendshape pair
    const own = (n) => face.ownLeftIsLeft ? [g(n + 'Left'), g(n + 'Right')] : [g(n + 'Right'), g(n + 'Left')];
    // ...and on which side of the screen to show it. In a mirror your left is on the left.
    const lr = (n) => { const o = own(n); return mirror ? o : [o[1], o[0]]; };
    const dir = mirror ? -1 : 1; // screen x direction of the person's own left

    const blink = lr('eyeBlink').map((v) => clamp((v - 0.15) / 0.45, 0, 1));
    const [wideL, wideR] = lr('eyeWide');
    const [squintL, squintR] = lr('eyeSquint');
    const [browOuterL, browOuterR] = lr('browOuterUp');
    const [browDownL, browDownR] = lr('browDown');
    const [smileL, smileR] = lr('mouthSmile');
    const [frownL, frownR] = lr('mouthFrown');
    const [stretchL, stretchR] = lr('mouthStretch');
    const lookIn = own('eyeLookIn'), lookOut = own('eyeLookOut');
    const lookOwnLeft = (lookOut[0] + lookIn[1] - lookIn[0] - lookOut[1]) / 2;
    const lookUp = (g('eyeLookUpLeft') + g('eyeLookUpRight') - g('eyeLookDownLeft') - g('eyeLookDownRight')) / 2;
    const mouthSide = own('mouth'); // mouthLeft / mouthRight

    const out = {
      blinkL: blink[0], blinkR: blink[1], wideL, wideR, squintL, squintR,
      browInnerUp: g('browInnerUp'), browOuterL, browOuterR, browDownL, browDownR,
      jawOpen: g('jawOpen'), smileL, smileR, frownL, frownR, stretchL, stretchR,
      pucker: g('mouthPucker'), funnel: g('mouthFunnel'), mouthShift: dir * (mouthSide[0] - mouthSide[1]),
      upperUp: (g('mouthUpperUpLeft') + g('mouthUpperUpRight')) / 2,
      lowerDown: (g('mouthLowerDownLeft') + g('mouthLowerDownRight')) / 2,
      cheekPuff: g('cheekPuff'),
      gazeX: dir * lookOwnLeft * 1.6, gazeY: lookUp * 1.6
    };

    if (face.matrix) {
      // Head pose in camera space (x = right of the raw image, y up, z toward
      // the camera). Turning to your own left points the nose to the right of
      // the raw image, so yaw and roll flip with the mirror like everything else.
      mat.fromArray(face.matrix);
      mat.decompose(v1, quat, v2);
      eul.setFromQuaternion(quat, 'YXZ');
      out.pitch = clamp(eul.x, -0.8, 0.8);
      out.yaw = clamp(dir * eul.y, -1, 1);
      out.roll = clamp(dir * eul.z, -0.8, 0.8);
    }
    return out;
  }

  // ---------- Idle and demo (no face) ----------
  const DEMO = [
    { name: 'neutral', e: {} },
    { name: 'happy', e: { smileL: 0.9, smileR: 0.9, squintL: 0.3, squintR: 0.3 } },
    { name: 'surprised', e: { jawOpen: 0.75, browInnerUp: 0.9, browOuterL: 0.8, browOuterR: 0.8, wideL: 0.8, wideR: 0.8, funnel: 0.3 } },
    { name: 'angry', e: { browDownL: 0.9, browDownR: 0.9, frownL: 0.5, frownR: 0.5, squintL: 0.5, squintR: 0.5, stretchL: 0.4, stretchR: 0.4 } },
    { name: 'kissy', e: { pucker: 0.95, squintL: 0.2, squintR: 0.2 } },
    { name: 'wink', e: { blinkR: 1, smileL: 0.6, smileR: 0.8, squintR: 0.4 } },
    { name: 'sad', e: { browInnerUp: 0.9, frownL: 0.8, frownR: 0.8, gazeY: -0.6 } },
    { name: 'puffed', e: { cheekPuff: 1, pucker: 0.3, wideL: 0.3, wideR: 0.3 } }
  ];
  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (ev) => {
    pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (ev.clientY / window.innerHeight) * 2 - 1;
  });
  let nextBlink = 1;

  function idle(time, demo) {
    const out = {};
    if (demo) Object.assign(out, DEMO[Math.floor(time / 2.6) % DEMO.length].e);
    // Look toward the mouse, with a gentle sway
    out.yaw = pointer.x * 0.5 + Math.sin(time * 0.5) * 0.08;
    out.pitch = pointer.y * 0.3 + Math.sin(time * 0.37) * 0.04;
    out.roll = Math.sin(time * 0.43) * 0.05;
    if (out.gazeX === undefined) out.gazeX = pointer.x * 0.8;
    if (out.gazeY === undefined) out.gazeY = -pointer.y * 0.6;
    if (time > nextBlink) nextBlink = time + 2.5 + Math.random() * 3;
    if (nextBlink - time > 2.35 && nextBlink - time < 2.5) { out.blinkL = 1; out.blinkR = 1; }
    return out;
  }

  // ---------- Mood ----------
  const MOODS = {
    neutral: '😐 Neutral', happy: '😄 Happy', surprised: '😲 Surprised', angry: '😠 Grumpy',
    sad: '😢 Sad', kissy: '😘 Kissy', wink: '😉 Wink', puffed: '🐡 Puffed up'
  };
  function moodOf(e) {
    const smile = ((e.smileL || 0) + (e.smileR || 0)) / 2;
    const frown = ((e.frownL || 0) + (e.frownR || 0)) / 2;
    const down = ((e.browDownL || 0) + (e.browDownR || 0)) / 2;
    if ((e.jawOpen || 0) > 0.45 && (e.browInnerUp || 0) > 0.25) return 'surprised';
    if (Math.abs((e.blinkL || 0) - (e.blinkR || 0)) > 0.6) return 'wink';
    if (smile > 0.45) return 'happy';
    if ((e.pucker || 0) > 0.55 && (e.cheekPuff || 0) < 0.5) return 'kissy';
    if ((e.cheekPuff || 0) > 0.45) return 'puffed';
    if (down > 0.35) return 'angry';
    if (frown > 0.3 || ((e.browInnerUp || 0) > 0.5 && smile < 0.1)) return 'sad';
    return 'neutral';
  }

  // ---------- UI ----------
  const video = $('video');
  const tracker = new window.FaceTracker(video);
  let lastFaceAt = -10;
  let faceTarget = null;
  let mood = '';
  let moodLabel = '';
  let forced = null; // test hook: AlienMirror.force({ smileL: 1, ... })

  function status(text) { $('status').textContent = text; }
  function renderButtons() {
    $('camBtn').textContent = tracker.running ? 'Stop camera' : 'Start camera';
    $('camBtn').classList.toggle('primary', !tracker.running);
    $('mirrorBtn').textContent = 'Mirror: ' + (mirror ? 'on' : 'off');
    $('previewBtn').textContent = 'Preview: ' + (preview ? 'on' : 'off');
    video.classList.toggle('hidden', !(preview && tracker.running));
  }

  async function startCamera() {
    const btn = $('camBtn');
    btn.disabled = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('This browser can\'t use the camera here. Open the page from https:// or localhost.');
      }
      status('Asking for camera access…');
      await tracker.startCamera();
      if (!tracker.landmarker) {
        status('Loading face tracker (about 13 MB, first time only)…');
        await tracker.load();
      }
      status('Tracking. Make faces at the alien!');
    } catch (e) {
      tracker.stopCamera();
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      status(denied ? 'Camera blocked. Allow camera access in the address bar, then try again.'
        : e && e.name === 'NotFoundError' ? 'No camera found.'
          : 'Could not start: ' + (e && e.message ? e.message : e));
    }
    btn.disabled = false;
    renderButtons();
  }

  $('camBtn').addEventListener('click', () => {
    if (tracker.running) {
      tracker.stopCamera();
      faceTarget = null;
      status('Camera off. Demo mode.');
      renderButtons();
    } else {
      startCamera();
    }
  });
  $('mirrorBtn').addEventListener('click', () => { mirror = !mirror; save('alienMirror', mirror); renderButtons(); });
  $('previewBtn').addEventListener('click', () => { preview = !preview; save('alienPreview', preview); renderButtons(); });
  renderButtons();

  // ---------- Loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = now / 1000;

    if (tracker.running) {
      const face = tracker.detect(now);
      if (face) { faceTarget = fromFace(face); lastFaceAt = time; }
      else if (face === null && time - lastFaceAt > 0.6) faceTarget = null;
    }
    const seeing = tracker.running && faceTarget && time - lastFaceAt < 0.6;
    const target = forced || (seeing ? faceTarget : idle(time, !tracker.running));

    const m = moodOf(target);
    if (m !== mood) { mood = m; alien.setMood(m); }
    const label = (seeing ? '' : tracker.running ? 'Looking for you… ' : 'Demo: ') + MOODS[m];
    if (label !== moodLabel) { moodLabel = label; $('mood').textContent = label; }

    alien.update(target, dt, time);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Small hook for testing from the console
  window.AlienMirror = {
    alien, tracker, fromFace, DEMO,
    force(e) { forced = e || null; },
    get mirror() { return mirror; }
  };
})();
