export const playSound = (type: 'cheer' | 'boo') => {
  const sounds = {
    // Sons de estádio reais
    cheer: 'https://www.soundjay.com/human/sounds/crowd-cheer-01.mp3',
    boo: 'https://www.soundjay.com/human/sounds/crowd-displeasure-01.mp3'
  };

  const audio = new Audio(sounds[type]);
  audio.volume = 0.6; // Aumentado um pouco o volume
  audio.play().catch(e => console.warn("🔇 Áudio bloqueado pelo navegador até interação do usuário.", e));
};
