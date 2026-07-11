import { WeaponId } from './protocol';

export class ArenaAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  shot(weapon: WeaponId, remote = false): void {
    this.unlock();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const duration = weapon === 'scattergun' ? 0.16 : weapon === 'smg' ? 0.065 : 0.1;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = weapon === 'scattergun' ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(weapon === 'scattergun' ? 95 : weapon === 'smg' ? 170 : 130, now);
    oscillator.frequency.exponentialRampToValueAtTime(48, now + duration);
    gain.gain.setValueAtTime(remote ? 0.06 : 0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);

    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    noise.buffer = buffer;
    noiseGain.gain.value = remote ? 0.08 : weapon === 'scattergun' ? 0.28 : 0.15;
    noise.connect(noiseGain).connect(this.master);
    noise.start(now);
  }

  hit(): void {
    this.tone(880, 0.045, 0.09);
  }

  empty(): void {
    this.tone(140, 0.035, 0.05, 'square');
  }

  reload(): void {
    this.tone(260, 0.05, 0.04, 'square');
    setTimeout(() => this.tone(390, 0.06, 0.04, 'square'), 180);
  }

  melee(): void {
    this.tone(110, 0.09, 0.08, 'sawtooth');
    setTimeout(() => this.tone(68, 0.06, 0.06, 'square'), 55);
  }

  footstep(sprinting = false): void {
    this.tone(sprinting ? 72 : 58, 0.035, sprinting ? 0.035 : 0.024, 'triangle');
  }

  explosion(): void {
    this.unlock();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const duration = 0.48;
    const oscillator = this.context.createOscillator();
    const oscillatorGain = this.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(92, now);
    oscillator.frequency.exponentialRampToValueAtTime(28, now + duration);
    oscillatorGain.gain.setValueAtTime(0.2, now);
    oscillatorGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(oscillatorGain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const envelope = Math.pow(1 - index / length, 2.2);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    noise.buffer = buffer;
    noiseGain.gain.value = 0.32;
    noise.connect(noiseGain).connect(this.master);
    noise.start(now);
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine'): void {
    this.unlock();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
