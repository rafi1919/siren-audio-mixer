import type { Preset } from './messages';

export interface Chain {
  input: AudioNode;
  output: AudioNode;
}

const impulses = new WeakMap<BaseAudioContext, AudioBuffer>();

// ponytail: generated decaying noise instead of a recorded room impulse; load a real IR file if it sounds fake
function impulse(ctx: BaseAudioContext): AudioBuffer {
  let buf = impulses.get(ctx);
  if (buf) return buf;
  const len = Math.floor(ctx.sampleRate * 1.5);
  buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  impulses.set(ctx, buf);
  return buf;
}

const filter = (ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, gain = 0) =>
  new BiquadFilterNode(ctx, { type, frequency, gain });

function series(first: AudioNode, ...rest: AudioNode[]): Chain {
  const output = rest.reduce((prev, node) => prev.connect(node), first);
  return { input: first, output };
}

// Numbers below are starting points, tune by ear.
export function buildChain(ctx: BaseAudioContext, preset: Preset): Chain {
  switch (preset) {
    case 'normal':
      return series(new GainNode(ctx));
    case 'clear':
      return series(
        filter(ctx, 'highpass', 100),
        filter(ctx, 'peaking', 3000, 4),
        new DynamicsCompressorNode(ctx, { threshold: -24, ratio: 4 }),
      );
    case 'muffled':
      return series(filter(ctx, 'lowpass', 500));
    case 'radio':
      return series(filter(ctx, 'highpass', 300), filter(ctx, 'lowpass', 3400));
    case 'background': {
      const lp = filter(ctx, 'lowpass', 1500);
      const out = new GainNode(ctx);
      lp.connect(new GainNode(ctx, { gain: 0.8 })).connect(out);
      lp.connect(new ConvolverNode(ctx, { buffer: impulse(ctx) }))
        .connect(new GainNode(ctx, { gain: 0.2 }))
        .connect(out);
      return { input: lp, output: out };
    }
  }
}
