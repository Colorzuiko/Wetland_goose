'use strict';

function makeShotgunSounds(context) {
  const rate = context.sampleRate;
  let seed = 0x46a29f3c;

  function sample(duration, peak, mix) {
    const buffer = context.createBuffer(1, Math.ceil(duration * rate), rate);
    const pcm = buffer.getChannelData(0);

    function noise(start, length, frequency, resonance, level, attack = .001) {
      const offset = Math.round(start * rate);
      const omega = 2 * Math.PI * Math.min(frequency, rate * .45) / rate;
      const alpha = Math.sin(omega) / (2 * resonance);
      const feed = alpha / (1 + alpha);
      const feedback1 = 2 * Math.cos(omega) / (1 + alpha);
      const feedback2 = (alpha - 1) / (1 + alpha);
      let input1 = 0, input2 = 0, output1 = 0, output2 = 0;
      for (let i = 0; i < length * rate && offset + i < pcm.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const input = seed / 0x80000000 - 1;
        const output = feed * (input - input2) + feedback1 * output1 + feedback2 * output2;
        const t = i / rate;
        const envelope = Math.min(1, t / attack) * (1 - t / length) ** 3;
        pcm[offset + i] += output * envelope * level;
        input2 = input1;
        input1 = input;
        output2 = output1;
        output1 = output;
      }
    }

    function ring(start, length, frequency, level) {
      const offset = Math.round(start * rate);
      for (let i = 0; i < length * rate && offset + i < pcm.length; i++) {
        const t = i / rate;
        pcm[offset + i] += Math.sin(t * frequency * 2 * Math.PI) * (1 - t / length) ** 4 * level;
      }
    }

    function reflection(delay, length, level) {
      const offset = Math.round(delay * rate);
      const count = Math.min(offset, Math.round(length * rate), pcm.length - offset);
      let softened = 0;
      for (let i = 0; i < count; i++) {
        softened += .28 * (pcm[i] - softened);
        pcm[offset + i] += softened * (1 - i / count) * level;
      }
    }

    mix({ noise, ring, reflection });
    const max = pcm.reduce((highest, value) => Math.max(highest, Math.abs(value)), 0);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= peak / max;
    return buffer;
  }

  return {
    eject: sample(.35, .29, ({ noise, ring }) => {
      noise(0, .095, 2450, .85, .56, .007);
      noise(.043, .046, 900, .8, .71);
      ring(.046, .09, 1642, .17);
      noise(.074, .045, 3620, 1.3, .57);
      ring(.087, .07, 2911, .13);
      // The loose shell rattles twice, softer and brighter than the bolt.
      noise(.151, .048, 4800, 1.7, .22);
      ring(.151, .14, 3816, .115);
      noise(.226, .046, 4120, 1.25, .11);
      ring(.228, .11, 3203, .076);
    }),
    load: sample(.31, .34, ({ noise, ring }) => {
      noise(0, .15, 1630, .68, .39, .019);
      noise(.035, .055, 3170, 1.13, .29, .005);
      noise(.091, .042, 2380, 1.05, .55);
      // A lower, solid latch closes the motion.
      noise(.127, .078, 693, .71, 1.19);
      noise(.127, .041, 2800, .78, .68);
      ring(.128, .1, 415, .23);
      ring(.129, .135, 1093, .15);
      noise(.161, .055, 1030, 1.15, .24);
    }),
    fire: sample(.68, .74, ({ noise, ring, reflection }) => {
      noise(0, .073, 3650, .42, 1.75, .0002);
      noise(0, .197, 850, .61, 1.25, .0005);
      noise(0, .225, 174, .69, 1.95, .0012);
      ring(.002, .16, 77, .44);
      noise(.019, .36, 289, .7, .48, .008);
      noise(.056, .60, 540, .71, .20, .045);
      reflection(.084, .073, .14);
      reflection(.168, .082, .073);
    }),
  };
}
