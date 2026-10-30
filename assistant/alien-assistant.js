/*
 * Alien Assistant — a talking 3D alien helper for the corner of any page
 *
 * Add one tag to a page:
 *   <script src="assistant/alien-assistant.js" defer></script>
 * It loads three.js, the alien head and the voice, then watches what the
 * visitor does (clicks, typing, forms, scrolling, copying, idling, leaving
 * and coming back, rage clicks, page errors) and comments out loud.
 * It never reads what people type, only which field they used.
 * Settings live behind the ⚙ button next to the alien.
 *
 * Page scripts can talk through it too:
 *   AlienAssistant.say('Your order is on its way!', 'happy');
 */
(function () {
  'use strict';
  if (window.AlienAssistant) return;

  const script = document.currentScript;
  const BASE = script ? script.src.replace(/[^/]*(\?.*)?$/, '') : 'assistant/';
  const VERSION = '1';
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  async function boot() {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = BASE + 'alien-assistant.css?v=' + VERSION;
    document.head.appendChild(css);
    if (!window.THREE) await loadScript(THREE_URL);
    if (!window.AlienHead) await loadScript(BASE + 'alien-head.js?v=' + VERSION);
    if (!window.AlienVoice) await loadScript(BASE + 'voice.js?v=' + VERSION);
    start();
  }

  // ---------- What it says ----------
  const LINES = {
    squeaky: {
      hello: ["Hi there, Earthling! I'm your alien assistant. I'll keep you company while you explore."],
      button: ['Ooh, you pressed {label}!', '{label}? Good choice!', 'Click! {label} it is.'],
      link: ['Off to {label}? Have a safe trip!', 'Ooh, a link! {label} looks interesting.'],
      toggle: ['{state} {label}. Got it!'],
      focus: ['Typing time! What will you put in {label}?'],
      typed: ['Nice typing! {label} is looking good.', 'Done with {label}? Looks great from here.'],
      submit: ['Form sent! Woohoo!', "Submitted! You're on a roll."],
      rage: ['Whoa, easy there! Is something not working?', 'So many clicks! Want me to call tech support on my planet?'],
      bottom: ['You made it all the way to the bottom! Impressive scrolling.'],
      copy: ['Copying that? Smart move, Earthling.'],
      idle: ["Still there, Earthling? I'm getting lonely."],
      back: ['Welcome back! I missed you.'],
      error: ["Uh oh, something broke on this page. Don't worry, it wasn't you!"],
      poke: ['Hi! Click my gear to change my voice.', 'Too chatty? Set me to Quiet in my settings.', 'I can move to the other corner. Check my settings!', 'Beep! Just kidding, I am not a robot. Unless you pick the robot voice.']
    },
    warrior: {
      hello: ['nuqneH! I am your alien warrior assistant. Explore this page with honor!'],
      button: ['You strike {label}! A bold move!', "{label}! Qapla'!"],
      link: ['You charge toward {label}! Onward!', '{label}? A worthy destination, warrior.'],
      toggle: ['{state} {label}. Your choice is made!'],
      focus: ['You approach {label}. Write with courage!'],
      typed: ['Your words in {label} are mighty!', '{label} is complete. Glorious!'],
      submit: ["Qapla'! The form is sent! Victory is ours!"],
      rage: ['Such fury! Even a warrior must breathe. Is something broken?'],
      bottom: ['You have reached the end of the page. A long and honorable journey!'],
      copy: ['You take that text as a trophy. Wise!'],
      idle: ['Do you sleep, warrior? The battle awaits!'],
      back: ['You return! The warrior is home!'],
      error: ['The page has been wounded! It is not your fault, warrior.'],
      poke: ['Click my gear to change my battle voice.', "Today is a glorious day to browse! Qapla'!"]
    }
  };
  const TEST_LINES = {
    squeaky: 'Hi! I am your alien assistant. Do you like my voice?',
    warrior: "nuqneH! I am the alien warrior assistant. Qapla'!",
    robot: 'Beep boop. Alien assistant online. Hello, Earthling.',
    custom: 'Hi! I am your alien assistant. Do you like my voice?'
  };
  // Events that matter enough to interrupt and ignore the cooldown
  const IMPORTANT = new Set(['hello', 'submit', 'rage', 'error', 'poke']);
  const CATEGORY = {
    button: 'clicks', link: 'clicks', toggle: 'clicks', rage: 'clicks',
    focus: 'typing', typed: 'typing', submit: 'typing',
    bottom: 'scroll', copy: 'scroll',
    idle: 'idle', back: 'idle'
  };
  const MOOD_OF = {
    hello: 'happy', button: 'happy', link: 'surprised', toggle: 'happy', typed: 'happy', submit: 'happy',
    rage: 'surprised', bottom: 'surprised', copy: 'wink', idle: 'sad', back: 'happy', error: 'sad', poke: 'happy'
  };
  const COOLDOWN = { quiet: 30, normal: 9, chatty: 3 };
  const PRESETS = {
    squeaky: { find: ['jessica', 'lily', 'laura', 'alice'], pitch: 1.5, speed: 1.0, effect: 'none' },
    warrior: { find: ['fierce warrior', 'harry', 'callum', 'george', 'roger', 'charlie'], pitch: 0.7, speed: 0.95, effect: 'growl' },
    robot: { find: ['river', 'will', 'liam', 'brian', 'eric'], pitch: 0.95, speed: 0.95, effect: 'robot' }
  };
  // Faces for each mood, in the alien head's expression channels
  const FACES = {
    happy: { smileL: 0.8, smileR: 0.8, squintL: 0.25, squintR: 0.25 },
    surprised: { jawOpen: 0.45, browInnerUp: 0.9, browOuterL: 0.7, browOuterR: 0.7, wideL: 0.7, wideR: 0.7 },
    sad: { browInnerUp: 0.85, frownL: 0.7, frownR: 0.7 },
    wink: { blinkR: 1, smileL: 0.5, smileR: 0.7 },
    angry: { browDownL: 0.8, browDownR: 0.8, frownL: 0.4, frownR: 0.4 }
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now() / 1000;

  // ---------- Settings ----------
  const STORE = 'alienAssistant';
  const DEFAULTS = {
    bubbles: true, chattiness: 'normal', corner: 'br', minimized: false,
    react: { clicks: true, typing: true, scroll: true, idle: true }
  };
  const prefs = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || '{}');
      return Object.assign({}, DEFAULTS, s, { react: Object.assign({}, DEFAULTS.react, s.react) });
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  })();
  function savePrefs() {
    try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) { /* storage off */ }
  }

  // ---------- Widget ----------
  function start() {
    const voice = window.AlienVoice;
    const vs = voice.settings;
    const T = window.THREE;

    const root = document.createElement('div');
    root.className = 'aa-root';
    root.innerHTML = `
      <div class="aa-bubble" role="status" aria-live="polite" hidden>
        <p class="aa-text"></p>
        <button type="button" class="aa-bubble-x" aria-label="Dismiss message">✕</button>
      </div>
      <div class="aa-panel" id="aa-panel" role="dialog" aria-labelledby="aa-panel-title" hidden>
        <div class="aa-panel-head">
          <h2 id="aa-panel-title">Assistant settings</h2>
          <button type="button" class="aa-icon aa-panel-x" aria-label="Close settings">✕</button>
        </div>
        <div class="aa-panel-body">
          <label class="aa-check"><input type="checkbox" id="aa-voice-on"> Speak out loud</label>
          <label class="aa-check"><input type="checkbox" id="aa-bubbles"> Show speech bubbles</label>
          <label class="aa-field">How chatty
            <select id="aa-chat">
              <option value="quiet">Quiet (only important things)</option>
              <option value="normal">Normal</option>
              <option value="chatty">Chatty</option>
            </select>
          </label>
          <fieldset class="aa-fieldset">
            <legend>React when I…</legend>
            <label class="aa-check"><input type="checkbox" data-react="clicks"> click buttons and links</label>
            <label class="aa-check"><input type="checkbox" data-react="typing"> type in forms</label>
            <label class="aa-check"><input type="checkbox" data-react="scroll"> scroll and copy</label>
            <label class="aa-check"><input type="checkbox" data-react="idle"> go idle or leave the tab</label>
          </fieldset>
          <label class="aa-field">Character
            <select id="aa-preset">
              <option value="squeaky">👽 Squeaky alien</option>
              <option value="warrior">⚔️ Warrior alien (Klingon-style)</option>
              <option value="robot">🤖 Robot alien</option>
              <option value="custom">🎛️ Custom</option>
            </select>
          </label>
          <label class="aa-field">Voice engine
            <select id="aa-engine">
              <option value="eleven">ElevenLabs</option>
              <option value="browser">Browser voice (free)</option>
            </select>
          </label>
          <div class="aa-field" id="aa-key-row">
            <label for="aa-key">ElevenLabs API key</label>
            <div class="aa-row">
              <input type="text" id="aa-key" placeholder="Paste your key (sk_…)" spellcheck="false" autocomplete="off" autocapitalize="off" data-lpignore="true" data-1p-ignore>
              <button type="button" class="aa-btn" id="aa-key-save">Save key</button>
            </div>
          </div>
          <label class="aa-field" id="aa-voice-row">Voice
            <select id="aa-voice"><option value="">Add a key to load voices</option></select>
          </label>
          <label class="aa-field">Effect (ElevenLabs only)
            <select id="aa-effect">
              <option value="none">None</option>
              <option value="growl">Warrior growl</option>
              <option value="robot">Robot</option>
            </select>
          </label>
          <label class="aa-field aa-slider">Pitch <output id="aa-pitch-out"></output><input type="range" id="aa-pitch" min="0.6" max="2" step="0.05"></label>
          <label class="aa-field aa-slider">Speed <output id="aa-speed-out"></output><input type="range" id="aa-speed" min="0.6" max="1.6" step="0.05"></label>
          <label class="aa-field aa-slider">Volume <output id="aa-vol-out"></output><input type="range" id="aa-vol" min="0" max="1" step="0.05"></label>
          <label class="aa-field">Corner
            <select id="aa-corner">
              <option value="br">Bottom right</option>
              <option value="bl">Bottom left</option>
            </select>
          </label>
          <button type="button" class="aa-btn aa-primary" id="aa-test">Test voice</button>
          <p class="aa-status" id="aa-status" role="status"></p>
          <p class="aa-fine">Your key is saved only in this browser and sent only to ElevenLabs. I never read what you type, only which field you used.</p>
        </div>
      </div>
      <div class="aa-dock">
        <div class="aa-tools">
          <button type="button" class="aa-icon" id="aa-mute"></button>
          <button type="button" class="aa-icon" id="aa-gear" aria-label="Assistant settings" aria-haspopup="dialog" aria-expanded="false" aria-controls="aa-panel" title="Settings">⚙</button>
          <button type="button" class="aa-icon" id="aa-min" aria-label="Hide assistant" title="Hide">–</button>
        </div>
        <button type="button" class="aa-face" id="aa-face" aria-label="Alien assistant. Click for a tip."><canvas aria-hidden="true"></canvas></button>
      </div>
      <button type="button" class="aa-restore" id="aa-restore" aria-label="Show alien assistant" hidden>👽</button>`;
    document.body.appendChild(root);
    const $ = (sel) => root.querySelector(sel);

    // ---------- 3D head ----------
    const canvas = $('.aa-face canvas');
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = T.ACESFilmicToneMapping;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.35, 7.2);
    camera.lookAt(0, 0.38, 0);
    scene.add(new T.HemisphereLight(0xcffafe, 0x1e1b4b, 1.2));
    const key = new T.DirectionalLight(0xffffff, 2.6);
    key.position.set(-2.5, 3, 4);
    scene.add(key);
    const rim = new T.DirectionalLight(0x67e8f9, 2.6);
    rim.position.set(3, 1.5, -3);
    scene.add(rim);
    const alien = new window.AlienHead(scene);

    function sizeCanvas() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }

    // ---------- Speaking ----------
    let mood = null, moodUntil = 0, lastSpoke = -100, bubbleUntil = 0;
    const bubble = $('.aa-bubble');

    function persona() { return vs.preset === 'warrior' ? 'warrior' : 'squeaky'; }

    function say(text, newMood) {
      const t = now();
      lastSpoke = t;
      mood = FACES[newMood] ? newMood : 'happy';
      moodUntil = t + 3;
      alien.setMood(mood === 'sad' ? 'sad' : mood === 'surprised' ? 'surprised' : mood === 'wink' ? 'wink' : 'happy');
      if (prefs.bubbles && !prefs.minimized && root.querySelector('#aa-panel').hidden) {
        $('.aa-text').textContent = text;
        bubble.hidden = false;
        bubbleUntil = t + clamp(text.length * 0.075, 3.5, 9);
      }
      voice.speak(vs.preset === 'robot' ? 'Beep. ' + text : text);
    }

    function cleanLabel(s) {
      return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'that';
    }

    /**
     * Comment on something the visitor did, if settings and timing allow.
     * Returns 'said', 'busy' (try again soon) or 'off' (settings say no).
     */
    function react(event, data) {
      if (prefs.minimized) return 'off';
      const cat = CATEGORY[event];
      if (cat && !prefs.react[cat]) return 'off';
      const important = IMPORTANT.has(event);
      if (!important && prefs.chattiness === 'quiet' && event !== 'back') return 'off';
      const t = now();
      if (!important && (t - lastSpoke < COOLDOWN[prefs.chattiness] || voice.speaking())) return 'busy';
      const set = LINES[persona()][event] || LINES.squeaky[event];
      if (!set) return 'off';
      const line = pick(set).replace(/\{(\w+)\}/g, (m, k) => (data && data[k]) || '');
      say(line.charAt(0).toUpperCase() + line.slice(1), MOOD_OF[event]);
      return 'said';
    }

    // For things worth mentioning a bit late, try again a few times if busy
    function reactSoon(event, data, tries) {
      if (react(event, data) === 'busy' && tries > 0) setTimeout(() => reactSoon(event, data, tries - 1), 2500);
    }

    // ---------- Watching what the visitor does ----------
    let lastActivity = now(), idleSaid = false, hiddenAt = 0, bottomSaid = false;
    const recentClicks = [];
    const typedFields = new WeakSet();
    const typingTimers = new WeakMap();
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    function activity() { lastActivity = now(); idleSaid = false; }
    function mine(el) { return el && root.contains(el); }

    function fieldName(el) {
      const lab = (el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') || el.name || 'that field';
      return cleanLabel(lab.replace(/[*:]/g, ''));
    }

    document.addEventListener('click', (ev) => {
      activity();
      if (mine(ev.target)) return;
      // Rage clicks: 4 quick clicks in about the same spot
      const t = now();
      recentClicks.push({ t, x: ev.clientX, y: ev.clientY });
      while (recentClicks.length && t - recentClicks[0].t > 1.5) recentClicks.shift();
      if (recentClicks.length >= 4 && recentClicks.every((c) => Math.hypot(c.x - ev.clientX, c.y - ev.clientY) < 60)) {
        recentClicks.length = 0;
        react('rage');
        return;
      }
      const el = ev.target.closest('a[href], button, [role="button"], input[type="submit"], input[type="button"], input[type="checkbox"], input[type="radio"], summary');
      if (!el) return;
      if (el.matches('input[type="checkbox"], input[type="radio"]')) {
        react('toggle', { label: fieldName(el), state: el.checked ? 'Checked' : 'Unchecked' });
      } else if (el.matches('a[href]')) {
        react('link', { label: cleanLabel(el.getAttribute('aria-label') || el.textContent) });
      } else if (!el.matches('[type="submit"]') && !(el.tagName === 'BUTTON' && el.form && el.type === 'submit')) {
        react('button', { label: cleanLabel(el.getAttribute('aria-label') || el.textContent || el.value) });
      }
    }, true);

    // Typing: only which field, never what was typed. Password fields are ignored.
    document.addEventListener('focusin', (ev) => {
      const el = ev.target;
      if (mine(el) || !el.matches || !el.matches('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea')) return;
      if (!typedFields.has(el)) react('focus', { label: fieldName(el) });
    });
    document.addEventListener('input', (ev) => {
      activity();
      const el = ev.target;
      if (mine(el) || !el.matches || !el.matches('input:not([type="password"]), textarea')) return;
      clearTimeout(typingTimers.get(el));
      typingTimers.set(el, setTimeout(() => {
        if (typedFields.has(el)) return;
        typedFields.add(el);
        reactSoon('typed', { label: fieldName(el) }, 6);
      }, 1500));
    });
    document.addEventListener('submit', (ev) => { if (!mine(ev.target)) react('submit'); }, true);
    document.addEventListener('copy', () => { activity(); react('copy'); });

    window.addEventListener('scroll', () => {
      activity();
      const doc = document.documentElement;
      if (doc.scrollHeight < window.innerHeight + 300) return;
      const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 40;
      if (atBottom && !bottomSaid) { bottomSaid = true; reactSoon('bottom', null, 2); }
      if (window.scrollY < doc.scrollHeight / 3) bottomSaid = false;
    }, { passive: true });

    window.addEventListener('pointermove', (ev) => { pointer.x = ev.clientX; pointer.y = ev.clientY; activity(); }, { passive: true });
    window.addEventListener('keydown', activity);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = now(); voice.stop(); }
      else if (hiddenAt && now() - hiddenAt > 8) { lastSpoke = -100; react('back'); }
    });
    window.addEventListener('error', () => react('error'));
    window.addEventListener('unhandledrejection', () => react('error'));
    setInterval(() => {
      if (!document.hidden && !idleSaid && now() - lastActivity > 45) { idleSaid = true; react('idle'); }
    }, 5000);

    // ---------- Settings panel ----------
    const panel = $('#aa-panel');
    const gear = $('#aa-gear');
    const field = (id) => root.querySelector('#aa-' + id);

    function render() {
      root.classList.toggle('aa-bl', prefs.corner === 'bl');
      root.classList.toggle('aa-minimized', prefs.minimized);
      $('#aa-restore').hidden = !prefs.minimized;
      field('mute').textContent = vs.enabled ? '🔊' : '🔇';
      field('mute').setAttribute('aria-label', vs.enabled ? 'Mute assistant' : 'Unmute assistant');
      field('mute').setAttribute('aria-pressed', String(!vs.enabled));
      field('mute').title = vs.enabled ? 'Mute' : 'Unmute';
      field('voice-on').checked = vs.enabled;
      field('bubbles').checked = prefs.bubbles;
      field('chat').value = prefs.chattiness;
      root.querySelectorAll('[data-react]').forEach((cb) => { cb.checked = prefs.react[cb.dataset.react]; });
      field('preset').value = vs.preset || 'squeaky';
      field('engine').value = vs.engine;
      field('effect').value = vs.effect || 'none';
      field('pitch').value = vs.pitch;
      field('speed').value = vs.speed;
      field('vol').value = vs.volume;
      field('pitch-out').textContent = vs.pitch.toFixed(2) + 'x';
      field('speed-out').textContent = vs.speed.toFixed(2) + 'x';
      field('vol-out').textContent = Math.round(vs.volume * 100) + '%';
      field('corner').value = prefs.corner;
      const eleven = vs.engine === 'eleven';
      field('key-row').hidden = !eleven;
      field('voice-row').hidden = !eleven;
    }
    function setVoice(changes) { Object.assign(vs, changes); voice.save(); render(); }
    function setPrefs(changes) { Object.assign(prefs, changes); savePrefs(); render(); }
    function status(text) { field('status').textContent = text; }

    async function loadVoices() {
      const sel = field('voice');
      if (!vs.apiKey) { sel.innerHTML = '<option value="">Add a key to load voices</option>'; return; }
      status('Key saved. Loading your ElevenLabs voices…');
      let list;
      try {
        list = await voice.listVoices();
        status('Key works! ' + list.length + ' voices loaded.');
      } catch (e) {
        list = voice.STANDARD_VOICES;
        status(/voices_read/.test(e.message)
          ? "Key saved. It can't list your own voices, so here are ElevenLabs' standard voices. (Give the key the \"Voices: read\" permission to see yours.)"
          : e.message + ' Showing standard voices instead.');
      }
      sel.textContent = '';
      list.forEach((v) => sel.add(new Option(v.name, v.id)));
      if (!list.some((v) => v.id === vs.voiceId) && list.length) { vs.voiceId = list[0].id; voice.save(); }
      sel.value = vs.voiceId;
    }

    function saveKey() {
      const k = field('key').value.replace(/[\s"'`]/g, '');
      field('key').value = k;
      if (k === vs.apiKey) { if (k) loadVoices(); return; }
      setVoice({ apiKey: k, voiceId: '' });
      if (!k) { status('Key removed. Using the browser voice.'); loadVoices(); return; }
      if (!/^sk_/.test(k)) status('Saved, but ElevenLabs keys usually start with "sk_".');
      loadVoices();
    }

    function openPanel() {
      bubble.hidden = true;
      panel.hidden = false;
      gear.setAttribute('aria-expanded', 'true');
      field('key').value = vs.apiKey;
      if (vs.apiKey && field('voice').options.length < 2) loadVoices();
      field('voice-on').focus();
    }
    function closePanel(returnFocus) {
      if (panel.hidden) return;
      panel.hidden = true;
      gear.setAttribute('aria-expanded', 'false');
      if (returnFocus) gear.focus();
    }

    gear.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel(true)));
    $('.aa-panel-x').addEventListener('click', () => closePanel(true));
    root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closePanel(true); });
    document.addEventListener('pointerdown', (ev) => { if (!mine(ev.target)) closePanel(false); });

    field('mute').addEventListener('click', () => { setVoice({ enabled: !vs.enabled }); if (!vs.enabled) voice.stop(); });
    field('min').addEventListener('click', () => { closePanel(false); voice.stop(); bubble.hidden = true; setPrefs({ minimized: true }); $('#aa-restore').focus(); });
    $('#aa-restore').addEventListener('click', () => { setPrefs({ minimized: false }); sizeCanvas(); gear.focus(); });
    $('#aa-face').addEventListener('click', () => react('poke'));
    $('.aa-bubble-x').addEventListener('click', () => { bubble.hidden = true; voice.stop(); });

    field('voice-on').addEventListener('change', (ev) => { setVoice({ enabled: ev.target.checked }); if (!vs.enabled) voice.stop(); });
    field('bubbles').addEventListener('change', (ev) => { setPrefs({ bubbles: ev.target.checked }); if (!prefs.bubbles) bubble.hidden = true; });
    field('chat').addEventListener('change', (ev) => setPrefs({ chattiness: ev.target.value }));
    root.querySelectorAll('[data-react]').forEach((cb) => cb.addEventListener('change', () => {
      prefs.react[cb.dataset.react] = cb.checked;
      savePrefs();
    }));
    field('corner').addEventListener('change', (ev) => setPrefs({ corner: ev.target.value }));
    field('engine').addEventListener('change', (ev) => { setVoice({ engine: ev.target.value }); if (ev.target.value === 'eleven') loadVoices(); });
    field('key').addEventListener('change', saveKey);
    field('key').addEventListener('paste', () => setTimeout(saveKey, 0));
    field('key').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); saveKey(); } });
    field('key-save').addEventListener('click', saveKey);
    field('voice').addEventListener('change', (ev) => setVoice({ voiceId: ev.target.value, preset: 'custom' }));
    field('effect').addEventListener('change', (ev) => setVoice({ effect: ev.target.value, preset: 'custom' }));
    [['pitch', 'pitch'], ['speed', 'speed'], ['vol', 'volume']].forEach(([id, k]) => {
      field(id).addEventListener('input', (ev) => setVoice(k === 'volume' ? { volume: Number(ev.target.value) } : { [k]: Number(ev.target.value), preset: 'custom' }));
    });
    field('preset').addEventListener('change', (ev) => {
      const name = ev.target.value;
      const p = PRESETS[name];
      if (!p) { setVoice({ preset: name }); return; }
      const opts = [...field('voice').options].filter((o) => o.value);
      let match = null;
      for (const want of p.find) {
        match = opts.find((o) => o.text.toLowerCase().includes(want));
        if (match) break;
      }
      setVoice({ preset: name, pitch: p.pitch, speed: p.speed, effect: p.effect, voiceId: match ? match.value : vs.voiceId });
      status((match ? 'Voice: ' + match.text.split(' - ')[0] + '. ' : '') + 'Press Test voice!');
    });
    field('test').addEventListener('click', async () => {
      if (field('key').value.trim() !== vs.apiKey) saveKey();
      status(voice.usingEleven ? 'Asking ElevenLabs…' : 'Using the free browser voice (no ElevenLabs key saved).');
      const ok = await voice.speak(TEST_LINES[vs.preset] || TEST_LINES.squeaky, true);
      if (ok) status('ElevenLabs voice working!');
    });
    voice.onError((m) => status(m + ' Using the browser voice for now.'));
    render();

    // ---------- Animation ----------
    let nextBlink = 1;
    let last = performance.now();
    function frame(ms) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (ms - last) / 1000);
      last = ms;
      if (prefs.minimized || document.hidden) return;
      const t = ms / 1000;
      if (bubbleUntil && now() > bubbleUntil && !voice.speaking()) { bubble.hidden = true; bubbleUntil = 0; }

      // Look at the mouse pointer
      const r = canvas.getBoundingClientRect();
      const gx = clamp((pointer.x - (r.left + r.width / 2)) / 500, -1, 1);
      const gy = clamp(-(pointer.y - (r.top + r.height * 0.45)) / 400, -1, 1);
      const target = Object.assign({
        gazeX: gx, gazeY: gy, yaw: gx * 0.5, pitch: -gy * 0.3, roll: Math.sin(t * 0.6) * 0.04
      }, mood && now() < moodUntil ? FACES[mood] : {});
      if (!(mood && now() < moodUntil)) alien.setMood('neutral');

      if (t > nextBlink) nextBlink = t + 2.5 + Math.random() * 3;
      if (nextBlink - t > 2.35 && nextBlink - t < 2.5) { target.blinkL = 1; target.blinkR = 1; }

      const talk = voice.level(t);
      if (talk > 0) {
        target.jawOpen = Math.max(target.jawOpen || 0, talk * 0.75);
        target.funnel = Math.max(target.funnel || 0, talk * 0.25);
      }
      alien.update(target, dt, t);
      renderer.render(scene, camera);
    }
    window.addEventListener('resize', sizeCanvas);
    sizeCanvas();
    requestAnimationFrame(frame);

    // Say hello once the page has settled (sound needs a click first in most browsers)
    setTimeout(() => react('hello'), 1200);

    window.AlienAssistant = {
      say(text, moodName) { say(String(text), moodName || 'happy'); },
      react,
      openSettings: openPanel,
      closeSettings: () => closePanel(false)
    };
  }

  window.AlienAssistant = { loading: true };
  const go = () => boot().catch((e) => console.error('[Alien Assistant]', e));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
