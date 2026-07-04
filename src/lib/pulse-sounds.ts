// Hardcoded notification sounds — synthesized with the Web Audio API, so there
// is nothing to download and playback is instant. Three distinct voices:
//   pulse     — a single clear ping
//   broadcast — a two-tone chime (rising, "announcement")
//   message   — a soft low pop
// Browsers block audio before the first user gesture; failures are swallowed.

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, volume = 0.12, type: OscillatorType = "sine") {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ac.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ac.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

export function playPulseSound() {
  try {
    tone(880, 0, 0.22);
  } catch { /* pre-gesture or unsupported — silent */ }
}

export function playBroadcastSound() {
  try {
    tone(660, 0, 0.18);
    tone(990, 0.16, 0.28);
  } catch { /* silent */ }
}

export function playMessageSound() {
  try {
    tone(420, 0, 0.16, 0.14, "triangle");
  } catch { /* silent */ }
}
