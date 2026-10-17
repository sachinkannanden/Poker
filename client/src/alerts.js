// Turn notifications: a short two-note chime plus a vibration where supported.
// Browsers only allow audio after a user gesture, so unlockAudio() runs on the first taps.
let ctx = null;
const KEY = 'holdem:sound';

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSoundOn(v) {
  try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* ignore */ }
}

export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx ||= new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio unavailable */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
}

function tone(freq, start, dur) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export function turnAlert() {
  if (!soundOn()) return;
  try {
    if (ctx && ctx.state === 'running') { tone(660, 0, 0.18); tone(880, 0.14, 0.28); }
  } catch { /* ignore */ }
  try { navigator.vibrate?.([90, 60, 90]); } catch { /* ignore */ }
}

// Chip sounds: a bright "clack" when chips land, a longer rattle when a stack slides to the pot.
function click(freq, start, dur, vol = 0.12) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, ctx.currentTime + start + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}
export function chipClack() {
  if (!soundOn()) return;
  try { if (ctx && ctx.state === 'running') { click(1900, 0, 0.05); click(1250, 0.02, 0.07, 0.08); } } catch { /* ignore */ }
  try { navigator.vibrate?.(8); } catch { /* ignore */ }
}
export function chipRattle(count = 4) {
  if (!soundOn()) return;
  try {
    if (ctx && ctx.state === 'running') {
      for (let i = 0; i < Math.min(count, 7); i++) click(1500 + Math.random() * 700, i * 0.055, 0.06, 0.07);
    }
  } catch { /* ignore */ }
}

// Card dealing: a short papery "fwip" (filtered noise).
let noiseBuf = null;
export function dealSwish() {
  if (!soundOn()) return;
  try {
    if (!ctx || ctx.state !== 'running') return;
    if (!noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.14);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2800;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  } catch { /* ignore */ }
}
