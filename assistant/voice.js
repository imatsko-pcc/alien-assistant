/*
 * Alien Assistant — the alien's voice
 *
 * Speaks with ElevenLabs text-to-speech when the player has pasted their
 * own API key into the voice settings, otherwise with the browser's
 * built-in speech. The key is kept only in this browser (localStorage) and
 * sent only to api.elevenlabs.io.
 *
 * High pitch: ElevenLabs has no pitch control, so we ask it for slower
 * speech and play the audio back faster without pitch correction. That
 * raises the pitch while keeping the talking speed the player chose.
 *
 * level() tells the mouth how open to be: measured from the ElevenLabs
 * audio, or a simple flap for the browser voice (its audio can't be read).
 */
(function () {
  'use strict';

  const API = 'https://api.elevenlabs.io/v1';
  const STORE = 'alienAssistantVoice';
  const DEFAULTS = {
    enabled: true, engine: 'eleven', apiKey: '', voiceId: '',
    pitch: 1.5, speed: 1.0, volume: 0.85, reactions: true,
    preset: 'squeaky', effect: 'none'
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const settings = (() => {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); }
  })();
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* storage off */ }
  }

  const cache = new Map(); // voice|speed|text -> audio URL, so repeated lines cost no credits
  let audio = null;
  let token = 0;
  let browserTalking = false;
  let onError = () => {};

  // Lip sync: route ElevenLabs audio through an analyser to measure loudness
  let actx = null, analyser = null, buf = null;
  function hookAnalyser(el) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      if (!analyser) {
        analyser = actx.createAnalyser();
        analyser.fftSize = 512;
        buf = new Uint8Array(analyser.fftSize);
        analyser.connect(actx.destination);
      }
      const src = actx.createMediaElementSource(el);
      effectChain(src, el).connect(analyser);
    } catch (e) { /* plays without measured lip sync */ }
  }

  function distortionCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return c;
  }

  /** Voice effects: a gravelly warrior growl, or a ring-modulated robot. */
  function effectChain(src, el) {
    const out = actx.createGain();
    const oscs = [];
    if (settings.effect === 'growl') {
      const shaper = actx.createWaveShaper();
      shaper.curve = distortionCurve(14);
      shaper.oversample = '4x';
      const bass = actx.createBiquadFilter();
      bass.type = 'lowshelf'; bass.frequency.value = 250; bass.gain.value = 9;
      const tame = actx.createBiquadFilter();
      tame.type = 'lowpass'; tame.frequency.value = 3400;
      const rumble = actx.createGain(); // fast flutter makes it sound gravelly
      rumble.gain.value = 0.75;
      const lfo = actx.createOscillator();
      lfo.frequency.value = 34;
      const depth = actx.createGain();
      depth.gain.value = 0.22;
      lfo.connect(depth).connect(rumble.gain);
      oscs.push(lfo);
      src.connect(shaper).connect(bass).connect(tame).connect(rumble).connect(out);
      out.gain.value = 0.7;
    } else if (settings.effect === 'robot') {
      const ring = actx.createGain();
      ring.gain.value = 0;
      const carrier = actx.createOscillator();
      carrier.frequency.value = 60;
      carrier.connect(ring.gain);
      oscs.push(carrier);
      const dry = actx.createGain();
      dry.gain.value = 0.35;
      src.connect(ring).connect(out);
      src.connect(dry).connect(out);
      out.gain.value = 1.3;
    } else {
      src.connect(out);
    }
    oscs.forEach((o) => o.start());
    const cleanup = () => oscs.forEach((o) => { try { o.stop(); } catch (e) { /* already stopped */ } });
    el.addEventListener('ended', cleanup);
    el.addEventListener('pause', cleanup);
    return out;
  }

  function useEleven() { return settings.engine === 'eleven' && !!settings.apiKey; }

  function stop() {
    token++;
    if (audio) { audio.pause(); audio = null; }
    browserTalking = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function speaking() { return browserTalking || (!!audio && !audio.paused && !audio.ended); }

  /** How open the mouth should be right now, 0..1. */
  function level(time) {
    if (audio && !audio.paused && !audio.ended) {
      if (!analyser) return 0.3 + 0.3 * Math.sin(time * 19);
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      return clamp((Math.sqrt(sum / buf.length) - 0.015) * 7, 0, 1);
    }
    if (browserTalking) return clamp(0.25 + 0.45 * Math.sin(time * 17) * Math.sin(time * 6.1 + 1), 0, 1);
    return 0;
  }

  async function elevenFetch(path, opts) {
    const r = await fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign({ 'xi-api-key': settings.apiKey }, (opts && opts.headers) || {})
    }));
    if (!r.ok) {
      let detail = '';
      try {
        const d = (await r.json()).detail;
        detail = typeof d === 'string' ? d : (d && (d.message || d.status)) || '';
      } catch (e) { /* not JSON */ }
      let msg;
      if (r.status === 401 && /permission/i.test(detail)) msg = 'This key is missing a permission: ' + detail;
      else if (r.status === 401) msg = 'ElevenLabs rejected the API key' + (detail ? ' (' + detail + ')' : '') + '. Check you pasted the whole key.';
      else if (r.status === 402 || /quota|credit/i.test(detail)) msg = "Out of ElevenLabs credits, or over this key's credit limit.";
      else msg = 'ElevenLabs error ' + r.status + (detail ? ': ' + detail : '') + '.';
      throw new Error(msg);
    }
    return r;
  }

  // ElevenLabs' standard voices, for keys that can speak but can't list voices
  const STANDARD_VOICES = [
    { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica' },
    { id: 'pFZP5JQG7iPjIQuC4Bku', name: 'Lily' },
    { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
    { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' },
    { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
    { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam' }
  ];

  async function listVoices() {
    if (!settings.apiKey) return [];
    const j = await (await elevenFetch('/voices')).json();
    return (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name }));
  }

  async function ensureVoice() {
    if (settings.voiceId) return settings.voiceId;
    let voices;
    try { voices = await listVoices(); } catch (e) { voices = STANDARD_VOICES; }
    if (!voices.length) voices = STANDARD_VOICES;
    const pref = voices.find((v) => /jessica|lily|laura|charlotte|rachel|alice/i.test(v.name)) || voices[0];
    settings.voiceId = pref.id;
    save();
    return pref.id;
  }

  function requestSpeed() { return clamp(settings.speed / settings.pitch, 0.7, 1.2); }

  async function elevenAudio(text) {
    const voice = await ensureVoice();
    const reqSpeed = requestSpeed();
    const key = voice + '|' + reqSpeed.toFixed(2) + '|' + text;
    if (!cache.has(key)) {
      const r = await elevenFetch('/text-to-speech/' + encodeURIComponent(voice) + '?output_format=mp3_44100_64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.4, speed: reqSpeed }
        })
      });
      cache.set(key, URL.createObjectURL(await r.blob()));
    }
    return cache.get(key);
  }

  function browserSpeak(text, my) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = clamp(settings.pitch, 0, 2);
    u.rate = clamp(settings.speed, 0.5, 2);
    u.volume = settings.volume;
    u.onstart = () => { if (my === token) browserTalking = true; };
    u.onend = u.onerror = () => { if (my === token) browserTalking = false; };
    synth.speak(u);
  }

  /**
   * Say a line. A new line interrupts the previous one. force ignores the
   * on/off switch. Resolves true when ElevenLabs is speaking it.
   */
  async function speak(text, force) {
    if (!force && !settings.enabled) return false;
    stop();
    const my = token;
    const line = String(text || '').replace(/\s+/g, ' ').trim();
    if (!line) return false;
    if (!useEleven()) { browserSpeak(line, my); return false; }
    try {
      const url = await elevenAudio(line);
      if (my !== token) return; // something newer was said while loading
      const el = new Audio(url);
      el.preservesPitch = false; // let faster playback raise the pitch
      el.mozPreservesPitch = false;
      el.webkitPreservesPitch = false;
      el.playbackRate = clamp(settings.speed / requestSpeed(), 0.5, 4);
      el.volume = settings.volume;
      hookAnalyser(el);
      audio = el;
      await el.play();
      return true;
    } catch (e) {
      if (my !== token) return false;
      audio = null;
      if (e.name === 'NotAllowedError') return false; // browser blocks sound until the first click
      onError(e.message || String(e));
      browserSpeak(line, my); // still say it, with the free voice
      return false;
    }
  }

  window.AlienVoice = {
    settings, save, speak, stop, listVoices, level, speaking, STANDARD_VOICES,
    get usingEleven() { return useEleven(); },
    onError(fn) { onError = fn; }
  };
})();
