/*
 * Alien Head 3D — the alien's voice
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
  const STORE = 'alienHeadVoice';
  const DEFAULTS = {
    enabled: true, engine: 'eleven', apiKey: '', voiceId: '',
    pitch: 1.5, speed: 1.0, volume: 0.85, reactions: true
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
      actx.createMediaElementSource(el).connect(analyser);
    } catch (e) { /* plays without measured lip sync */ }
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
      try { const j = await r.json(); detail = (j.detail && (j.detail.message || j.detail.status)) || ''; } catch (e) { /* not JSON */ }
      throw new Error(r.status === 401 ? 'ElevenLabs rejected the API key.' : 'ElevenLabs error ' + r.status + (detail ? ': ' + detail : '') + '.');
    }
    return r;
  }

  async function listVoices() {
    if (!settings.apiKey) return [];
    const j = await (await elevenFetch('/voices')).json();
    return (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name }));
  }

  async function ensureVoice() {
    if (settings.voiceId) return settings.voiceId;
    const voices = await listVoices();
    if (!voices.length) throw new Error('No voices found in this ElevenLabs account.');
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

  /** Say a line. A new line interrupts the previous one. force ignores the on/off switch. */
  async function speak(text, force) {
    if (!force && !settings.enabled) return;
    stop();
    const my = token;
    const line = String(text || '').replace(/\s+/g, ' ').trim();
    if (!line) return;
    if (!useEleven()) { browserSpeak(line, my); return; }
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
    } catch (e) {
      if (my !== token) return;
      audio = null;
      if (e.name === 'NotAllowedError') return; // browser blocks sound until the first click
      onError(e.message || String(e));
      browserSpeak(line, my); // still say it, with the free voice
    }
  }

  window.AlienVoice = {
    settings, save, speak, stop, listVoices, level, speaking,
    get usingEleven() { return useEleven(); },
    onError(fn) { onError = fn; }
  };
})();
