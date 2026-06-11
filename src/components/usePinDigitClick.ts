"use client";

import { useCallback, useRef } from "react";

type WebAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export function usePinDigitClick(): () => void {
  const audioContextRef = useRef<AudioContext | null>(null);

  return useCallback(() => {
    const audioWindow = window as WebAudioWindow;
    const AudioContextCtor = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = audioContext;

    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }

    const sampleRate = audioContext.sampleRate;
    const clickDuration = 0.026;
    const frameCount = Math.floor(sampleRate * clickDuration);
    const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
    const samples = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const progress = i / frameCount;
      const hardAttack = i < Math.floor(sampleRate * 0.0025) ? 1 : 0;
      const decay = Math.exp(-progress * 20);
      samples[i] = (Math.random() * 2 - 1) * decay * (0.7 + hardAttack * 0.3);
    }

    const clickSource = audioContext.createBufferSource();
    const clickFilter = audioContext.createBiquadFilter();
    const clickGain = audioContext.createGain();
    const bassOscillator = audioContext.createOscillator();
    const bassFilter = audioContext.createBiquadFilter();
    const bassGain = audioContext.createGain();
    const now = audioContext.currentTime;

    clickFilter.type = "bandpass";
    clickFilter.frequency.setValueAtTime(1400, now);
    clickFilter.Q.setValueAtTime(0.9, now);
    clickGain.gain.setValueAtTime(0.0001, now);
    clickGain.gain.exponentialRampToValueAtTime(0.144, now + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + clickDuration);

    bassOscillator.type = "sine";
    bassOscillator.frequency.setValueAtTime(92, now);
    bassOscillator.frequency.exponentialRampToValueAtTime(46, now + 0.075);
    bassFilter.type = "lowpass";
    bassFilter.frequency.setValueAtTime(180, now);
    bassGain.gain.setValueAtTime(0.0001, now);
    bassGain.gain.exponentialRampToValueAtTime(0.352, now + 0.004);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);

    clickSource.buffer = buffer;
    clickSource.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(audioContext.destination);
    bassOscillator.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(audioContext.destination);
    clickSource.start(now);
    bassOscillator.start(now);
    clickSource.stop(now + clickDuration);
    bassOscillator.stop(now + 0.11);
  }, []);
}
