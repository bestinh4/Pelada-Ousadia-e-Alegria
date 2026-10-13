// Web Audio API Synthesizer + Fallback Audio Player
// Produz apito de juiz de futebol ultra-realista e 100% offline, sem depender de download ou conexao de rede.

export type WhistlePattern = 'single' | 'double' | 'start' | 'triple';
export type SoundType = 'cheer' | 'boo' | 'whistle' | 'whistle_single' | 'whistle_double' | 'whistle_start' | 'whistle_triple';

let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioContextClass();
    } catch (e) {
      console.warn("Nao foi possivel inicializar AudioContext:", e);
    }
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
};

/**
 * Toca um unico sopro de apito com frequencias acusticas reais e modulacao de esfera (pea whistle trill)
 */
const playWhistleBurst = (
  ctx: AudioContext, 
  startTime: number, 
  duration: number, 
  baseFreq: number = 2750, 
  peakGain: number = 0.35
) => {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const mainGain = ctx.createGain();

  // Frequencias tipicas de apito profissional de arbitragem (Fox 40 / Acme)
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(baseFreq, startTime);
  osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.05, startTime + duration * 0.5);
  osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.98, startTime + duration);

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(baseFreq * 1.12, startTime);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, startTime + duration * 0.5);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.10, startTime + duration);

  // Modulacao rapida (trill da esfera no interior do apito: ~26-32 Hz)
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(28, startTime);
  lfoGain.gain.setValueAtTime(120, startTime); // modulacao de frequencia em Hz

  lfo.connect(osc1.frequency);
  lfo.connect(osc2.frequency);

  // Envelope do sopro: ataque agudo e rapido, sustentacao firme e corte limpo
  mainGain.gain.setValueAtTime(0.0001, startTime);
  mainGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.025);
  mainGain.gain.setValueAtTime(peakGain, startTime + duration - 0.04);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc1.connect(mainGain);
  osc2.connect(mainGain);
  mainGain.connect(ctx.destination);

  osc1.start(startTime);
  osc2.start(startTime);
  lfo.start(startTime);

  osc1.stop(startTime + duration);
  osc2.stop(startTime + duration);
  lfo.stop(startTime + duration);
};

/**
 * Toca o som oficial de apito do juiz de futebol
 * - single: 1 apito curto e firme (alerta para confirmacao de atletas)
 * - double: 2 apitos (sorteio dos times realizado)
 * - start: 1 apito longo e forte (apito inicial da pelada / bola rolando)
 * - triple: 3 apitos (apito final / pelada encerrada)
 */
export const playWhistleSound = (pattern: WhistlePattern = 'single') => {
  // Vibracao fisica no celular Android se suportada
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (pattern === 'single') navigator.vibrate([200]);
      else if (pattern === 'double') navigator.vibrate([200, 100, 250]);
      else if (pattern === 'start') navigator.vibrate([500]);
      else if (pattern === 'triple') navigator.vibrate([200, 100, 200, 100, 450]);
    } catch {}
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + 0.02;

  try {
    if (pattern === 'single') {
      // 1 apito curto (0.35s)
      playWhistleBurst(ctx, now, 0.35, 2750, 0.4);
    } else if (pattern === 'double') {
      // 2 apitos (piii - piiii!)
      playWhistleBurst(ctx, now, 0.28, 2700, 0.38);
      playWhistleBurst(ctx, now + 0.36, 0.36, 2800, 0.42);
    } else if (pattern === 'start') {
      // 1 apito longo e marcante de inicio de jogo (0.8s)
      playWhistleBurst(ctx, now, 0.85, 2780, 0.45);
    } else if (pattern === 'triple') {
      // 3 apitos tradicionais de encerramento de partida (pii - pii - piiiii!)
      playWhistleBurst(ctx, now, 0.22, 2700, 0.35);
      playWhistleBurst(ctx, now + 0.30, 0.22, 2720, 0.35);
      playWhistleBurst(ctx, now + 0.60, 0.70, 2820, 0.45);
    }
  } catch (err) {
    console.warn("Erro ao sintetizar apito:", err);
  }
};

/**
 * Funcao geral para tocar sons de futebol no aplicativo
 */
export const playSound = (type: SoundType) => {
  if (type === 'whistle' || type === 'whistle_single') {
    playWhistleSound('single');
    return;
  }
  if (type === 'whistle_double') {
    playWhistleSound('double');
    return;
  }
  if (type === 'whistle_start') {
    playWhistleSound('start');
    return;
  }
  if (type === 'whistle_triple') {
    playWhistleSound('triple');
    return;
  }

  // Sons de estadio tradicionais com fallback
  const sounds: Record<string, string> = {
    cheer: 'https://www.soundjay.com/human/sounds/crowd-cheer-01.mp3',
    boo: 'https://www.soundjay.com/human/sounds/crowd-displeasure-01.mp3'
  };

  const soundUrl = sounds[type];
  if (soundUrl) {
    try {
      const audio = new Audio(soundUrl);
      audio.volume = 0.6;
      audio.play().catch(() => {
        // Fallback para apito sintetizado se audio externo for bloqueado
        if (type === 'cheer') playWhistleSound('double');
      });
    } catch {
      if (type === 'cheer') playWhistleSound('double');
    }
  }
};
