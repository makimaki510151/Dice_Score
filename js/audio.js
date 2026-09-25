let context;

function audio() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;
  if (!context) context = new Ctx();
  if (context.state === "suspended") context.resume();
  return context;
}

function beep(mute, frequency, duration, type, volume) {
  if (mute) return;
  const ctx = audio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function sfx(mute, name) {
  if (name === "click") beep(mute, 280, 0.04, "square", 0.015);
  if (name === "roll") beep(mute, 440, 0.07, "triangle", 0.03);
  if (name === "lock") {
    beep(mute, 523, 0.08, "sine", 0.04);
    setTimeout(() => beep(mute, 659, 0.1, "sine", 0.03), 70);
  }
  if (name === "unlock") {
    beep(mute, 523, 0.1, "sine", 0.04);
    setTimeout(() => beep(mute, 659, 0.1, "sine", 0.04), 100);
    setTimeout(() => beep(mute, 784, 0.18, "sine", 0.04), 200);
  }
}
