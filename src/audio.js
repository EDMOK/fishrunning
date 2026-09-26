/* Procedural audio — every sound is synthesised, so the game ships with no audio
 * files. Two halves:
 *
 *   SFX   short one-shot voices, humanised slightly so repeats never sound
 *         machine-identical.
 *   BGM   a real arrangement: drum kit, bass, arpeggio, pad and a written melody
 *         over an 8-bar progression, with the mix opening up as the run speeds
 *         up so the music grows with the player.
 */
(function () {
  'use strict';

  var ctx = null;
  var master = null, sfxBus = null, bgmBus = null, drumBus = null;
  var bgmFilter = null, reverb = null, reverbSend = null;
  // Arrangeable stem groups. Fading these is how the music builds with speed.
  // Fade-able stems. Drums are not here: drumBus is the drum stem.
  var stem = { bass: null, arp: null, pad: null, lead: null };
  var muted = false;
  var noiseBuf = null;

  function now() { return ctx ? ctx.currentTime : 0; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  /** Small random offset so repeated hits are not bit-identical. */
  function hum(amount) { return (Math.random() * 2 - 1) * (amount || 0.004); }

  function makeReverb(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * seconds));
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    var c = ctx.createConvolver();
    c.buffer = buf;
    return c;
  }

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);

    // A short plate-ish reverb. Cheap to generate and it is most of what makes
    // the difference between "beeping" and "produced".
    reverb = makeReverb(1.7, 3.0);
    var revGain = ctx.createGain();
    revGain.gain.value = 0.34;
    reverb.connect(revGain);
    revGain.connect(master);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(reverb);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.6;
    sfxBus.connect(master);
    sfxBus.connect(reverbSend);

    bgmFilter = ctx.createBiquadFilter();
    bgmFilter.type = 'lowpass';
    bgmFilter.frequency.value = 1600;      // opens up as the run speeds up
    bgmFilter.Q.value = 0.5;

    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0;
    bgmBus.connect(bgmFilter);
    bgmFilter.connect(master);

    var bgmRev = ctx.createGain();
    bgmRev.gain.value = 0.22;
    bgmFilter.connect(bgmRev);
    bgmRev.connect(reverbSend);

    // drumBus IS the drum stem: DRUM.* feed it directly and it is always at full,
    // so it does not need an extra gain stage in `stem`.
    drumBus = ctx.createGain();
    drumBus.gain.value = 1;
    drumBus.connect(bgmBus);
    var drumRev = ctx.createGain();
    drumRev.gain.value = 0.3;
    drumBus.connect(drumRev);
    drumRev.connect(reverbSend);

    ['bass', 'arp', 'pad', 'lead'].forEach(function (k) {
      var g = ctx.createGain();
      g.gain.value = 0;
      g.connect(bgmBus);
      stem[k] = g;
    });

    var n = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    return true;
  }

  // ---------------------------------------------------------------- primitives
  function tone(opt) {
    if (!ensure()) return null;
    var t0 = (opt.at || now()) + (opt.delay || 0) + hum(opt.jitter == null ? 0.003 : opt.jitter);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = opt.type || 'square';
    o.frequency.setValueAtTime(opt.f0, t0);
    if (opt.f1 != null) {
      if (opt.exp === false) o.frequency.linearRampToValueAtTime(opt.f1, t0 + opt.dur);
      else o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t0 + opt.dur);
    }
    var peak = opt.vol == null ? 0.3 : opt.vol * (opt.humanize === false ? 1 : (1 + hum(0.05)));
    var atk = opt.atk || 0.006;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    if (opt.hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + atk + opt.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + (opt.hold || 0) + opt.dur);
    if (opt.filter) {
      var f = ctx.createBiquadFilter();
      f.type = opt.filter;
      f.frequency.value = opt.filterHz || 1200;
      f.Q.value = opt.filterQ == null ? 0.8 : opt.filterQ;
      g.connect(f); f.connect(opt.bus || sfxBus);
    } else {
      g.connect(opt.bus || sfxBus);
    }
    o.connect(g);
    o.start(t0);
    o.stop(t0 + atk + (opt.hold || 0) + opt.dur + 0.03);
    return o;
  }

  function noise(opt) {
    if (!ensure()) return;
    var t0 = (opt.at || now()) + (opt.delay || 0) + hum(opt.jitter == null ? 0.002 : opt.jitter);
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = opt.rate || 1;
    var f = ctx.createBiquadFilter();
    f.type = opt.filter || 'bandpass';
    f.frequency.setValueAtTime(opt.f0, t0);
    if (opt.f1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t0 + opt.dur);
    f.Q.value = opt.q == null ? 1.2 : opt.q;
    var g = ctx.createGain();
    var peak = (opt.vol == null ? 0.25 : opt.vol) * (1 + hum(0.06));
    var atk = opt.atk || 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + opt.dur);
    s.connect(f); f.connect(g); g.connect(opt.bus || sfxBus);
    s.start(t0);
    s.stop(t0 + atk + opt.dur + 0.05);
  }

  // -------------------------------------------------------------- drum voices
  var DRUM = {
    kick: function (at, vol, bus) {
      bus = bus || drumBus;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(148, at);
      o.frequency.exponentialRampToValueAtTime(44, at + 0.085);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
      o.connect(g); g.connect(bus);
      o.start(at); o.stop(at + 0.28);
      // beater click so it cuts through on small speakers
      noise({ filter: 'lowpass', f0: 2400, f1: 400, dur: 0.03, vol: vol * 0.35, at: at, jitter: 0, bus: bus });
    },
    snare: function (at, vol, bus) {
      bus = bus || drumBus;
      noise({ filter: 'bandpass', f0: 1900, f1: 1100, dur: 0.13, vol: vol * 0.8, q: 0.75, at: at, jitter: 0, bus: bus });
      noise({ filter: 'highpass', f0: 4200, dur: 0.06, vol: vol * 0.3, q: 0.6, at: at, jitter: 0, bus: bus });
      tone({ type: 'triangle', f0: 196, f1: 150, dur: 0.07, vol: vol * 0.5, at: at, jitter: 0, bus: bus });
    },
    hat: function (at, vol, bus) {
      noise({ filter: 'highpass', f0: 8200, dur: 0.035, vol: vol, q: 0.7, at: at, jitter: 0, bus: bus || drumBus });
    },
    openHat: function (at, vol, bus) {
      noise({ filter: 'highpass', f0: 7400, dur: 0.18, vol: vol, q: 0.6, at: at, jitter: 0, bus: bus || drumBus });
    },
    crash: function (at, vol, bus) {
      noise({ filter: 'highpass', f0: 5200, dur: 1.1, vol: vol, q: 0.4, atk: 0.006, at: at, jitter: 0, bus: bus || drumBus });
      noise({ filter: 'bandpass', f0: 9000, f1: 5000, dur: 0.5, vol: vol * 0.4, q: 0.5, at: at, jitter: 0, bus: bus || drumBus });
    }
  };

  // ------------------------------------------------------------- melodic voices
  /** Warm bass: sine sub under a triangle, lowpassed. */
  function bassVoice(midi, dur, at, vol) {
    var f = mtof(midi);
    tone({ type: 'triangle', f0: f, dur: dur, vol: vol, atk: 0.008, hold: dur * 0.3,
           filter: 'lowpass', filterHz: 900, at: at, bus: stem.bass });
    tone({ type: 'sine', f0: f / 2, dur: dur * 1.1, vol: vol * 0.8, atk: 0.01, hold: dur * 0.4,
           at: at, bus: stem.bass });
  }

  /** Plucky arpeggio voice. */
  function arpVoice(midi, dur, at, vol) {
    tone({ type: 'square', f0: mtof(midi), dur: dur, vol: vol, atk: 0.004,
           filter: 'lowpass', filterHz: 3400, filterQ: 1.1, at: at, bus: stem.arp });
    tone({ type: 'triangle', f0: mtof(midi + 12), dur: dur * 0.5, vol: vol * 0.45,
           at: at, bus: stem.arp });
  }

  /** Sustained pad: two detuned saws under a slow filter. */
  function padVoice(midi, dur, at, vol) {
    var f = mtof(midi);
    [-7, 7].forEach(function (cents) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f * Math.pow(2, cents / 1200);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.28);
      g.gain.setValueAtTime(vol, at + Math.max(0.3, dur - 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.2);
      var fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(700, at);
      fl.frequency.linearRampToValueAtTime(1900, at + dur * 0.5);
      fl.Q.value = 1.4;
      o.connect(fl); fl.connect(g); g.connect(stem.pad);
      o.start(at); o.stop(at + dur + 0.3);
    });
  }

  /** Lead: triangle + detuned square, with a soft attack and a little vibrato. */
  function leadVoice(midi, dur, at, vol) {
    var f = mtof(midi);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.02);
    g.gain.setValueAtTime(vol, at + Math.max(0.04, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    var fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 4200;
    fl.Q.value = 0.7;
    g.connect(fl);
    fl.connect(stem.lead);

    var lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 5.2;
    lfoG.gain.value = f * 0.006;
    lfo.connect(lfoG);

    [[0, 'triangle', 1], [6, 'square', 0.34]].forEach(function (spec) {
      var o = ctx.createOscillator(), og = ctx.createGain();
      o.type = spec[1];
      o.frequency.value = f * Math.pow(2, spec[0] / 1200);
      og.gain.value = spec[2];
      lfoG.connect(o.frequency);
      o.connect(og); og.connect(g);
      o.start(at); o.stop(at + dur + 0.05);
    });
    lfo.start(at); lfo.stop(at + dur + 0.05);
  }

  // ------------------------------------------------------------------ one-shots
  var SFX = {
    jump: function () {
      tone({ type: 'square', f0: 300, f1: 680, dur: 0.15, vol: 0.24, atk: 0.003 });
      tone({ type: 'triangle', f0: 150, f1: 340, dur: 0.13, vol: 0.18 });
      noise({ filter: 'bandpass', f0: 900, f1: 2600, dur: 0.06, vol: 0.1, q: 0.8 });
    },
    djump: function () {
      tone({ type: 'square', f0: 520, f1: 900, dur: 0.12, vol: 0.22, atk: 0.003 });
      tone({ type: 'square', f0: 780, f1: 1300, dur: 0.14, vol: 0.17, delay: 0.06 });
      tone({ type: 'sine', f0: 1200, f1: 2000, dur: 0.20, vol: 0.13, delay: 0.08 });
      noise({ filter: 'highpass', f0: 4000, dur: 0.16, vol: 0.08, q: 0.6, delay: 0.07 });
    },
    land: function () {
      noise({ filter: 'lowpass', f0: 1000, f1: 180, dur: 0.12, vol: 0.18, q: 0.8 });
      tone({ type: 'sine', f0: 120, f1: 62, dur: 0.11, vol: 0.16 });
    },
    slide: function () {
      noise({ filter: 'bandpass', f0: 1700, f1: 420, dur: 0.34, vol: 0.14, q: 0.8 });
      noise({ filter: 'highpass', f0: 5000, f1: 2200, dur: 0.22, vol: 0.06, q: 0.5 });
    },
    coin: function (n) {
      var step = Math.min(n || 0, 12);
      var f = 784 * Math.pow(1.0595, step);      // G5, rising with the combo
      tone({ type: 'triangle', f0: f, dur: 0.06, vol: 0.22, atk: 0.002 });
      tone({ type: 'triangle', f0: f * 1.5, dur: 0.13, vol: 0.19, delay: 0.05 });
      tone({ type: 'sine', f0: f * 3, dur: 0.09, vol: 0.07, delay: 0.05 });
    },
    bigrice: function () {
      [0, 4, 7, 12, 16].forEach(function (s, i) {
        tone({ type: 'triangle', f0: 587 * Math.pow(1.0595, s), dur: 0.16, vol: 0.2, delay: i * 0.05 });
      });
      tone({ type: 'sine', f0: 1174, f1: 2349, dur: 0.35, vol: 0.1, delay: 0.2, exp: false });
    },
    power: function () {
      tone({ type: 'sawtooth', f0: 180, f1: 900, dur: 0.3, vol: 0.1, exp: false, atk: 0.02 });
      [0, 5, 9, 12, 16, 21].forEach(function (s, i) {
        tone({ type: 'square', f0: 392 * Math.pow(1.0595, s), dur: 0.13, vol: 0.15, delay: i * 0.042 });
      });
    },
    shield: function () {
      [0, 7, 12, 16, 19].forEach(function (s, i) {
        tone({ type: 'sine', f0: 523 * Math.pow(1.0595, s), dur: 0.5, vol: 0.11, delay: i * 0.05, atk: 0.02 });
      });
      noise({ filter: 'highpass', f0: 6000, dur: 0.4, vol: 0.07, q: 0.5 });
    },
    shieldBreak: function () {
      noise({ filter: 'highpass', f0: 2400, f1: 900, dur: 0.3, vol: 0.2, q: 0.5 });
      [12, 9, 5, 0].forEach(function (s, i) {
        tone({ type: 'triangle', f0: 1046 * Math.pow(1.0595, s), dur: 0.22, vol: 0.13, delay: i * 0.035 });
      });
    },
    hit: function () {
      noise({ filter: 'lowpass', f0: 1800, f1: 140, dur: 0.32, vol: 0.32, q: 0.7 });
      tone({ type: 'sawtooth', f0: 320, f1: 62, dur: 0.34, vol: 0.24 });
      tone({ type: 'square', f0: 150, f1: 44, dur: 0.4, vol: 0.19 });
      tone({ type: 'sine', f0: 90, f1: 40, dur: 0.45, vol: 0.2 });
    },
    combo: function (tier) {
      var f = 880 * Math.pow(1.0595, Math.min(tier * 2, 14));
      [0, 4, 7, 12].forEach(function (s, i) {
        tone({ type: 'triangle', f0: f * Math.pow(1.0595, s), dur: 0.15, vol: 0.15, delay: i * 0.045 });
      });
    },
    over: function () {
      [0, -3, -7, -12, -19, -24].forEach(function (s, i) {
        tone({ type: 'square', f0: 660 * Math.pow(1.0595, s), dur: 0.36, vol: 0.18, delay: i * 0.15 });
        tone({ type: 'triangle', f0: 330 * Math.pow(1.0595, s), dur: 0.4, vol: 0.12, delay: i * 0.15 });
      });
      noise({ filter: 'lowpass', f0: 700, f1: 80, dur: 1.5, vol: 0.11, delay: 0.08 });
    },
    start: function () {
      [0, 7, 12, 19, 24].forEach(function (s, i) {
        tone({ type: 'square', f0: 523 * Math.pow(1.0595, s), dur: 0.19, vol: 0.18, delay: i * 0.075 });
        tone({ type: 'triangle', f0: 262 * Math.pow(1.0595, s), dur: 0.22, vol: 0.13, delay: i * 0.075 });
      });
    },
    ui: function () { tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.07, vol: 0.14 }); },

    /** Zone change: a wide rising sweep, like a level sign passing overhead. */
    zone: function () {
      tone({ type: 'sine', f0: 300, f1: 900, dur: 0.55, vol: 0.13, atk: 0.05 });
      [0, 7, 12].forEach(function (s, i) {
        tone({ type: 'triangle', f0: 523 * Math.pow(1.0595, s), dur: 0.3, vol: 0.12, delay: i * 0.09 });
      });
      noise({ filter: 'bandpass', f0: 600, f1: 3200, dur: 0.4, vol: 0.07, q: 0.7 });
    },

    /** Event card landing: two bright blips then a shimmer. */
    event: function () {
      tone({ type: 'square', f0: 880, dur: 0.09, vol: 0.16, atk: 0.002 });
      tone({ type: 'square', f0: 1174, dur: 0.11, vol: 0.15, delay: 0.09 });
      [0, 5, 9, 14].forEach(function (s, i) {
        tone({ type: 'sine', f0: 1318 * Math.pow(1.0595, s), dur: 0.26, vol: 0.09, delay: 0.2 + i * 0.05 });
      });
    },

    /** Milestone tick: small, frequent, must not get annoying. */
    milestone: function () {
      tone({ type: 'sine', f0: 1046, dur: 0.07, vol: 0.10 });
      tone({ type: 'sine', f0: 1568, dur: 0.1, vol: 0.07, delay: 0.055 });
    },

    /** Dash: a short forward lunge — air rushing past, then a rising snap. */
    dash: function () {
      noise({ filter: 'highpass', f0: 900, f1: 5200, dur: 0.22, vol: 0.16, q: 0.6 });
      tone({ type: 'sawtooth', f0: 220, f1: 880, dur: 0.2, vol: 0.11, exp: false, atk: 0.004 });
      tone({ type: 'square', f0: 1320, dur: 0.07, vol: 0.08, delay: 0.03 });
    },

    /** Stomp: a heavy plant, then a bright ping for the reward. */
    stomp: function () {
      noise({ filter: 'lowpass', f0: 1200, f1: 120, dur: 0.2, vol: 0.28, q: 0.7 });
      tone({ type: 'square', f0: 180, f1: 58, dur: 0.22, vol: 0.22 });
      [0, 7, 12].forEach(function (s, i) {
        tone({ type: 'triangle', f0: 784 * Math.pow(1.0595, s), dur: 0.16, vol: 0.14, delay: 0.05 + i * 0.04 });
      });
    },

    /** Glide: soft air under the feet. Quiet on purpose — it can run a while. */
    glide: function () {
      noise({ filter: 'bandpass', f0: 800, f1: 1900, dur: 0.45, vol: 0.09, q: 0.7 });
      tone({ type: 'sine', f0: 392, f1: 523, dur: 0.35, vol: 0.06, atk: 0.06 });
    },

    /** Card taken: a proper chunky reward chord. */
    card: function () {
      [0, 4, 7, 12, 16, 19, 24].forEach(function (s, i) {
        tone({ type: 'triangle', f0: 440 * Math.pow(1.0595, s), dur: 0.34, vol: 0.13, delay: i * 0.05 });
        tone({ type: 'sine', f0: 220 * Math.pow(1.0595, s), dur: 0.4, vol: 0.08, delay: i * 0.05 });
      });
      noise({ filter: 'highpass', f0: 4000, f1: 9000, dur: 0.35, vol: 0.05, q: 0.6 });
    }
  };

  // --------------------------------------------------------------------- music
  // 138bpm, 8-bar loop in C. Four stems (bass / arp / pad / lead) over a drum kit,
  // so the mix can grow with the run instead of just getting louder.
  var BPM = 138;
  var BEAT = 60 / BPM;
  var S16 = BEAT / 4;
  var BAR = BEAT * 4;
  var LOOP_BARS = 8;

  // MIDI. I - V - vi - IV - IV - V - iii - vi : bright, then lifts in the back half.
  var PROG = [
    { bass: 36, triad: [60, 64, 67], pad: [60, 64, 67, 72] },   // C
    { bass: 43, triad: [59, 62, 67], pad: [59, 62, 67, 71] },   // G
    { bass: 45, triad: [60, 64, 69], pad: [57, 60, 64, 69] },   // Am
    { bass: 41, triad: [60, 65, 69], pad: [57, 60, 65, 69] },   // F
    { bass: 41, triad: [60, 65, 69], pad: [57, 60, 65, 69] },   // F
    { bass: 43, triad: [59, 62, 67], pad: [59, 62, 67, 71] },   // G
    { bass: 40, triad: [59, 64, 67], pad: [55, 59, 64, 67] },   // Em
    { bass: 45, triad: [60, 64, 69], pad: [57, 60, 64, 69] }    // Am
  ];

  // Melody as [bar, step, midi, lengthInSteps]. One written 8-bar phrase.
  var MELODY = [
    [0, 0, 67, 2], [0, 2, 72, 2], [0, 4, 76, 4], [0, 10, 74, 2], [0, 12, 72, 4],
    [1, 0, 74, 3], [1, 4, 71, 2], [1, 6, 67, 2], [1, 8, 71, 4], [1, 14, 74, 2],
    [2, 0, 72, 5], [2, 6, 76, 2], [2, 8, 81, 4], [2, 12, 79, 4],
    [3, 0, 77, 3], [3, 4, 76, 2], [3, 6, 72, 2], [3, 8, 69, 6],
    [4, 0, 69, 2], [4, 2, 72, 2], [4, 4, 77, 4], [4, 8, 81, 6],
    [5, 0, 79, 3], [5, 4, 77, 2], [5, 6, 74, 2], [5, 8, 71, 6],
    [6, 0, 76, 2], [6, 2, 79, 2], [6, 4, 83, 4], [6, 8, 81, 4], [6, 12, 79, 2],
    [7, 0, 76, 5], [7, 6, 72, 2], [7, 8, 69, 7]
  ];

  // 16-step drum patterns, per bar. `fill` replaces the last bar of the loop.
  var KICK = [0, 8, 14];
  var SNARE = [4, 12];
  var HAT = [0, 2, 4, 6, 8, 10, 12, 14];
  var HAT_OPEN = [14];

  var bgmOn = false, bgmStep = 0, nextStepAt = 0, timer = null;
  var melodyIdx = 0, intensity = 0, targetStems = null;

  function scheduleStep(step, at) {
    var bar = Math.floor(step / 16) % LOOP_BARS;
    var s = step % 16;
    var ch = PROG[bar];
    var isFillBar = (bar === LOOP_BARS - 1);

    // ---- drums
    if (s === 0 && bar === 0) DRUM.crash(at, 0.12);
    if (KICK.indexOf(s) >= 0) DRUM.kick(at, s === 0 ? 0.55 : 0.42);
    if (isFillBar && s >= 8) {
      // snare roll into the top of the loop
      DRUM.snare(at, 0.16 + (s - 8) * 0.035);
    } else if (SNARE.indexOf(s) >= 0) {
      DRUM.snare(at, 0.3);
    }
    if (HAT.indexOf(s) >= 0) {
      DRUM.hat(at, (s % 4 === 0 ? 0.055 : 0.032));
    }
    if (!isFillBar && HAT_OPEN.indexOf(s) >= 0) DRUM.openHat(at, 0.05);

    // ---- bass: root on the downbeat, octave lift on the offbeat
    if (s === 0 || s === 6 || s === 10) {
      bassVoice(ch.bass, S16 * (s === 0 ? 2.2 : 1.1), at, s === 0 ? 0.34 : 0.2);
    } else if (s === 8) {
      bassVoice(ch.bass + 7, S16 * 1.6, at, 0.22);
    }

    // ---- arpeggio: root / third / fifth / octave, with a lift at the bar end
    var arpNote = ch.triad[s % 3] + (s % 8 >= 6 ? 12 : 0);
    arpVoice(arpNote, S16 * 1.3, at, 0.062);

    // ---- pad: one long chord per bar
    if (s === 0) {
      ch.pad.forEach(function (m) { padVoice(m, BAR * 0.95, at, 0.028); });
    }

    // ---- melody
    while (melodyIdx < MELODY.length && MELODY[melodyIdx][0] * 16 + MELODY[melodyIdx][1] <= step) {
      var n = MELODY[melodyIdx];
      if (n[0] * 16 + n[1] === step) {
        leadVoice(n[2], S16 * n[3] * 0.92, at, 0.13);
      }
      melodyIdx++;
    }
  }

  function pump() {
    if (!bgmOn || !ctx) return;
    var horizon = ctx.currentTime + 0.3;
    var guard = 0;
    while (nextStepAt < horizon && guard++ < 64) {
      scheduleStep(bgmStep, Math.max(nextStepAt, ctx.currentTime + 0.01));
      bgmStep++;
      if (bgmStep >= LOOP_BARS * 16) { bgmStep = 0; melodyIdx = 0; }
      nextStepAt += S16;
    }
  }

  /** Stem levels for a given intensity: the band fills in as the run speeds up. */
  function stemMix(t) {
    return {
      bass: 1,
      arp: 0.45 + t * 0.55,
      pad: t < 0.18 ? t / 0.18 * 0.55 : 0.55 + Math.min(1, (t - 0.18) / 0.5) * 0.45,
      lead: t < 0.45 ? 0 : Math.min(1, (t - 0.45) / 0.35)
    };
  }

  function applyStems(immediate) {
    if (!ctx) return;
    var mix = stemMix(intensity);
    Object.keys(mix).forEach(function (k) {
      if (!stem[k]) return;
      var target = mix[k];
      stem[k].gain.cancelScheduledValues(ctx.currentTime);
      stem[k].gain.setValueAtTime(stem[k].gain.value, ctx.currentTime);
      if (immediate) stem[k].gain.linearRampToValueAtTime(target, ctx.currentTime + 0.05);
      else stem[k].gain.setTargetAtTime(target, ctx.currentTime, 0.9);
    });
  }

  window.GameAudio = {
    unlock: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    sfx: function (name, arg) {
      if (muted || !ensure()) return;
      var f = SFX[name];
      if (f) { try { f(arg); } catch (e) { /* audio glitches must never break the game */ } }
    },
    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.85;
    },
    isMuted: function () { return muted; },

    startBgm: function () {
      if (!ensure()) return;
      bgmOn = true;
      bgmStep = 0;
      melodyIdx = 0;
      intensity = 0;
      nextStepAt = ctx.currentTime + 0.1;
      applyStems(true);
      bgmBus.gain.cancelScheduledValues(ctx.currentTime);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, ctx.currentTime);
      bgmBus.gain.linearRampToValueAtTime(0.62, ctx.currentTime + 1.1);
      if (timer) clearInterval(timer);
      timer = setInterval(pump, 40);
      pump();
    },
    stopBgm: function () {
      if (!ctx) return;
      bgmOn = false;
      bgmBus.gain.cancelScheduledValues(ctx.currentTime);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, ctx.currentTime);
      bgmBus.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.4);
      if (timer) { clearInterval(timer); timer = null; }
    },
    duckBgm: function (on) {
      if (!ctx) return;
      bgmBus.gain.cancelScheduledValues(ctx.currentTime);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, ctx.currentTime);
      bgmBus.gain.linearRampToValueAtTime(on ? 0.14 : 0.62, ctx.currentTime + 0.25);
    },
    /** 0..1 — opens the lowpass and brings the rest of the band in. */
    setIntensity: function (t) {
      if (!ctx) return;
      t = Math.max(0, Math.min(1, t));
      if (Math.abs(t - intensity) < 0.01) return;
      intensity = t;
      bgmFilter.frequency.setTargetAtTime(1500 + t * 6000, ctx.currentTime, 0.5);
      applyStems(false);
    },

    /**
     * Test hook: an AnalyserNode tapped off the master bus.
     *
     * Audio cannot be verified by reading code, and this game has to be checked
     * without a listener, so tests sample the real output through this and assert
     * on RMS / spectral content. Read-only; it cannot affect playback.
     */
    _tap: function () {
      if (!ensure()) return null;
      var a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0;
      master.connect(a);
      return a;
    },
    _state: function () {
      return ctx ? { running: bgmOn, intensity: intensity, stems: Object.keys(stem).map(function (k) {
        return k + '=' + stem[k].gain.value.toFixed(2);
      }).join(' ') } : null;
    }
  };
})();
