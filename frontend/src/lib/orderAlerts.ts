let audioContext: AudioContext | null = null;

const AudioContextClass = () =>
  window.AudioContext ||
  (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

export async function playNewOrderSound(): Promise<boolean> {
  const Context = AudioContextClass();
  if (!Context) return false;

  try {
    audioContext ??= new Context();
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (audioContext.state !== 'running') return false;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.21);
    return true;
  } catch {
    return false;
  }
}
