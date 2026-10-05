// Optional sound and haptics, both off by default. Sounds are soft sine tones
// made on the fly (no audio files), so they work offline and stay quiet.
//
// iPhone Safari has no navigator.vibrate. From iOS 18, toggling a
// <input type="checkbox" switch> gives a light system tap, so haptics use
// that when vibrate is missing. Both only fire from a touch handler.

export function createFeedback(getSettings) {
  let ctx = null;

  function audio() {
    if (!getSettings().sound) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, at, dur, vol = 0.07) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + at;
    const osc = a.createOscillator(), gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function tap() {
    if (!getSettings().haptics) return;
    if (navigator.vibrate) { navigator.vibrate(12); return; }
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    label.style.display = 'none';
    document.body.appendChild(label);
    label.click();
    label.remove();
  }

  // C major notes, so everything sounds gentle together.
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  return {
    // iOS only lets audio start inside a touch, so wake it on every touch down.
    unlock() { audio(); },
    pickUp() { tap(); },
    place() { tone(392, 0, 0.12, 0.05); tap(); },
    clear(lines) {
      for (let i = 0; i < Math.min(lines, 4) + 1; i++) tone(NOTES[i], i * 0.07, 0.3);
      tap();
      if (lines > 1) setTimeout(tap, 90);
    },
    levelUp() { [0, 2, 3, 5].forEach((n, i) => tone(NOTES[n], i * 0.1, 0.45, 0.06)); },
    gameOver() { [3, 2, 0].forEach((n, i) => tone(NOTES[n] / 2, i * 0.16, 0.5, 0.06)); tap(); },
    test() { tone(NOTES[2], 0, 0.25); tap(); },
  };
}
