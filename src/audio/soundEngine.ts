import type { ProceduralSound, SoundChoice } from '../types';

/**
 * Background sound, bells and tones. Procedural sounds are generated with the Web Audio API;
 * uploaded tracks play from their stored Blob. Both go through the same chain, so bells and
 * the eye-rest tone can dip them:
 *
 *   source(s) -> filters -> noiseGain -> duckGain -> master -> destination
 *   bell / tone voices --------------------------> master
 */

export interface SoundState {
  choice: SoundChoice;
  playing: boolean;
  loading: boolean;
  volume: number;
  supported: boolean;
  error: string | null;
}

export const PROCEDURAL_SOUNDS: { value: ProceduralSound; label: string; description: string }[] = [
  { value: 'brown', label: 'Brown Noise', description: 'Deep, even rumble that masks room noise • Synthesized procedural' },
  { value: 'rain', label: 'Soft Rain', description: 'Soft rain on leaves and a warm room • Synthesized procedural' },
  { value: 'storm', label: 'Heavy Rainstorm', description: 'Heavy, steady rainfall for loud surroundings • Synthesized procedural' },
  { value: 'drone', label: 'Deep Space Drone', description: 'Slow, low hum for long sessions • Synthesized procedural' },
];

export function isCustomChoice(c: SoundChoice): c is `custom:${string}` {
  return c.startsWith('custom:');
}

type Listener = (s: SoundState) => void;
type TrackLoader = (id: string) => Promise<Blob | null>;

const LOOP_SECONDS = 6;
const CROSSFADE_SECONDS = 0.5;
const FADE_IN = 1.2;
const FADE_OUT = 0.6;

/** Loudness of each kind relative to the volume slider. */
const LEVEL: Record<ProceduralSound | 'custom', number> = { brown: 0.55, rain: 0.55, storm: 0.6, drone: 0.5, custom: 0.9 };

interface Voice {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  level: number;
  media?: { el: HTMLAudioElement; url: string; node: MediaElementAudioSourceNode };
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Builds a seamless loop by blending the tail of a longer render into its head. */
function loopBuffer(ctx: AudioContext, gen: (n: number) => Float32Array): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(LOOP_SECONDS * rate);
  const fade = Math.floor(CROSSFADE_SECONDS * rate);
  const raw = gen(len + fade);
  const buf = ctx.createBuffer(1, len, rate);
  const out = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < len; i++) {
    let v = raw[i];
    if (i < fade) {
      const t = i / fade;
      v = raw[i] * t + raw[len + i] * (1 - t);
    }
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const norm = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) out[i] *= norm;
  return buf;
}

function brownNoise(n: number): Float32Array {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

function pinkNoise(n: number): Float32Array {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    out[i] = (b0 + b1 + b2 + white * 0.1848) * 0.05;
  }
  return out;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private duck: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private bellGain: GainNode | null = null;
  private buffers: Partial<Record<'brown' | 'pink', AudioBuffer>> = {};
  private voice: Voice | null = null;
  private loader: TrackLoader | null = null;
  private token = 0;
  private state: SoundState = { choice: 'brown', playing: false, loading: false, volume: 0.5, supported: getAudioContextCtor() !== null, error: null };
  private listeners = new Set<Listener>();

  getState(): SoundState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Lets the engine read uploaded tracks from the database. */
  setTrackLoader(fn: TrackLoader): void {
    this.loader = fn;
  }

  private emit(partial: Partial<SoundState>): void {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) fn(this.state);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const duck = ctx.createGain();
    duck.connect(master);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseGain.connect(duck);
    const bellGain = ctx.createGain();
    bellGain.gain.value = 0.85;
    bellGain.connect(master);
    Object.assign(this, { ctx, duck, noiseGain, bellGain });
    return ctx;
  }

  private buffer(kind: 'brown' | 'pink'): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.buffers[kind]) this.buffers[kind] = loopBuffer(ctx, kind === 'brown' ? brownNoise : pinkNoise);
    return this.buffers[kind]!;
  }

  private loopSource(kind: 'brown' | 'pink', rate = 1): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.buffer(kind);
    src.loop = true;
    src.playbackRate.value = rate;
    return src;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private gain(v: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }

  /** A slow oscillator that moves `param` by ±depth. */
  private lfo(freq: number, depth: number, param: AudioParam, sources: AudioScheduledSourceNode[], nodes: AudioNode[]): void {
    const osc = this.ctx!.createOscillator();
    osc.frequency.value = freq;
    const amount = this.gain(depth);
    osc.connect(amount).connect(param);
    sources.push(osc);
    nodes.push(amount);
  }

  private buildProcedural(kind: ProceduralSound): Voice {
    const ctx = this.ctx!;
    const out = this.noiseGain!;
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];

    if (kind === 'brown') {
      const src = this.loopSource('brown');
      const lp = this.filter('lowpass', 900, 0.5);
      src.connect(lp).connect(out);
      sources.push(src);
      nodes.push(lp);
    } else if (kind === 'rain' || kind === 'storm') {
      const heavy = kind === 'storm';
      // Wash: a broad bed of pink noise with a slow swell.
      const wash = this.loopSource('pink');
      const hp = this.filter('highpass', heavy ? 250 : 350);
      const lp = this.filter('lowpass', heavy ? 6500 : 5200);
      const shelf = this.filter('highshelf', 4000);
      shelf.gain.value = heavy ? -3 : -6;
      const swell = this.gain(heavy ? 1 : 0.85);
      this.lfo(0.13, heavy ? 0.2 : 0.15, swell.gain, sources, nodes);
      wash.connect(hp).connect(lp).connect(shelf).connect(swell).connect(out);
      // Drops: a lighter, faster layer, like rain on a window.
      const drops = this.loopSource('pink', heavy ? 1.21 : 1.37);
      const bp = this.filter('bandpass', heavy ? 3200 : 2500, heavy ? 0.6 : 0.8);
      const dropGain = this.gain(heavy ? 0.5 : 0.35);
      this.lfo(heavy ? 0.9 : 0.6, heavy ? 0.18 : 0.12, dropGain.gain, sources, nodes);
      drops.connect(bp).connect(dropGain).connect(out);
      sources.push(wash, drops);
      nodes.push(hp, lp, shelf, swell, bp, dropGain);
      if (heavy) {
        // Rumble: low brown noise that rises and falls like distant thunder.
        const rumble = this.loopSource('brown', 0.8);
        const rlp = this.filter('lowpass', 160, 0.6);
        const rGain = this.gain(0.55);
        this.lfo(0.05, 0.45, rGain.gain, sources, nodes);
        rumble.connect(rlp).connect(rGain).connect(out);
        sources.push(rumble);
        nodes.push(rlp, rGain);
      }
    } else {
      // Deep space drone: slow beating low tones under a drifting filter.
      const lp = this.filter('lowpass', 420, 0.7);
      this.lfo(0.03, 180, lp.frequency, sources, nodes);
      const bed = this.gain(1);
      lp.connect(bed).connect(out);
      nodes.push(lp, bed);
      const tones: [OscillatorType, number, number][] = [
        ['sine', 55, 0.32],
        ['sine', 55.4, 0.28],
        ['triangle', 82.4, 0.14],
        ['sine', 110.3, 0.12],
      ];
      for (const [type, freq, amp] of tones) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const g = this.gain(amp);
        osc.connect(g).connect(lp);
        sources.push(osc);
        nodes.push(g);
      }
      const air = this.loopSource('brown', 0.7);
      const airLp = this.filter('lowpass', 300, 0.5);
      const airGain = this.gain(0.12);
      air.connect(airLp).connect(airGain).connect(out);
      sources.push(air);
      nodes.push(airLp, airGain);
    }
    const t = ctx.currentTime;
    for (const s of sources) s.start(t);
    return { sources, nodes, level: LEVEL[kind] };
  }

  private async buildCustom(id: string): Promise<Voice> {
    if (!this.loader) throw new Error('Uploaded tracks are not ready yet.');
    const blob = await this.loader(id);
    if (!blob) throw new Error('This track is no longer on this device.');
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.loop = true;
    el.preload = 'auto';
    const node = this.ctx!.createMediaElementSource(el);
    node.connect(this.noiseGain!);
    try {
      await el.play();
    } catch (e) {
      node.disconnect();
      URL.revokeObjectURL(url);
      throw new Error(e instanceof Error && e.name === 'NotSupportedError' ? 'This browser cannot play this file.' : 'The track could not start. Try again.');
    }
    return { sources: [], nodes: [node], level: LEVEL.custom, media: { el, url, node } };
  }

  private releaseVoice(voice: Voice, at: number): void {
    for (const s of voice.sources) {
      try {
        s.stop(at);
      } catch {
        /* already stopped */
      }
    }
    const ms = Math.max(0, (at - (this.ctx?.currentTime ?? 0)) * 1000) + 50;
    setTimeout(() => {
      for (const n of [...voice.sources, ...voice.nodes]) n.disconnect();
      if (voice.media) {
        voice.media.el.pause();
        voice.media.el.removeAttribute('src');
        URL.revokeObjectURL(voice.media.url);
      }
    }, ms);
  }

  private fadeTo(level: number, seconds: number): void {
    const g = this.noiseGain!.gain;
    const t = this.ctx!.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + seconds);
  }

  private targetLevel(): number {
    return this.state.volume * (this.voice?.level ?? 0.55);
  }

  /** Starts background sound. Call from a user gesture the first time. */
  async play(choice: SoundChoice): Promise<void> {
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.voice && this.state.playing && this.state.choice === choice) return;
    const token = ++this.token;
    if (this.voice) {
      this.fadeTo(0, 0.25);
      this.releaseVoice(this.voice, ctx.currentTime + 0.3);
      this.voice = null;
    }
    this.emit({ choice, playing: true, loading: isCustomChoice(choice), error: null });
    try {
      const voice = isCustomChoice(choice) ? await this.buildCustom(choice.slice('custom:'.length)) : this.buildProcedural(choice);
      if (token !== this.token) {
        this.releaseVoice(voice, ctx.currentTime);
        return;
      }
      this.voice = voice;
      const g = this.noiseGain!.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(0, ctx.currentTime);
      g.linearRampToValueAtTime(this.targetLevel(), ctx.currentTime + FADE_IN);
      this.emit({ loading: false });
    } catch (e) {
      if (token !== this.token) return;
      this.emit({ playing: false, loading: false, error: e instanceof Error ? e.message : 'The sound could not start.' });
    }
  }

  stop(): void {
    this.token++;
    if (this.ctx && this.voice) {
      this.fadeTo(0, FADE_OUT);
      this.releaseVoice(this.voice, this.ctx.currentTime + FADE_OUT + 0.05);
      this.voice = null;
    }
    this.emit({ playing: false, loading: false });
  }

  toggle(choice: SoundChoice): void {
    if (this.state.playing) this.stop();
    else void this.play(choice);
  }

  /** Stops the sound if it is the given uploaded track (for example when it is deleted). */
  stopIfTrack(id: string): void {
    if (this.state.choice === `custom:${id}` && this.state.playing) this.stop();
  }

  setVolume(volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    this.emit({ volume: v });
    if (this.ctx && this.voice) this.fadeTo(this.targetLevel(), 0.2);
  }

  private dip(hold: number, release: number): number {
    const t = this.ctx!.currentTime;
    const d = this.duck!.gain;
    d.cancelScheduledValues(t);
    d.setValueAtTime(d.value, t);
    d.linearRampToValueAtTime(0.25, t + 0.12);
    d.setValueAtTime(0.25, t + hold);
    d.linearRampToValueAtTime(1, t + hold + release);
    return t + 0.1;
  }

  /** A soft acoustic bell. Background sound dips while it rings. */
  chime(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const start = this.dip(1.5, 2.5);
    const partials: [number, number, number][] = [
      [1, 0.2, 3.2],
      [2.76, 0.085, 1.8],
      [5.4, 0.045, 1.0],
      [8.93, 0.022, 0.6],
    ];
    for (const [ratio, amp, decay] of partials) this.note(528 * ratio, amp, start, decay, 0.008);
  }

  /** Two gentle rising notes for the 20-20-20 eye-rest reminder. */
  eyeRestTone(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const start = this.dip(2, 2);
    this.note(659.25, 0.12, start, 1.4, 0.12);
    this.note(880, 0.1, start + 0.55, 1.6, 0.12);
  }

  private note(freq: number, amp: number, start: number, decay: number, attack: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(amp, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(env).connect(this.bellGain!);
    osc.start(start);
    osc.stop(start + decay + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  /** Call from a user gesture so later chimes are allowed to play. */
  unlock(): void {
    this.ensure();
  }
}

export const soundEngine = new SoundEngine();
