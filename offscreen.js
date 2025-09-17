function playBeep() {
  try {
    const audioContext = new (self.AudioContext || self.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(900, audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.35);
  } catch (e) {
    // No-op
  }
}

self.chrome?.runtime?.onMessage?.addListener((msg) => {
  if (msg?.play) {
    try {
      const url = chrome.runtime.getURL(msg.play.source);
      const audio = new Audio(url);
      audio.volume = msg.play.volume ?? 1;
      audio.currentTime = 0;
      audio.play().catch(err => console.error('Audio play error:', err));
    } catch (e) {
      console.error('Audio setup error:', e);
    }
  }
});

