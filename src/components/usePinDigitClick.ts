"use client";

import { useCallback, useEffect, useRef } from "react";

const PIN_CLICK_SOUND = "/Sound%20effects/creatorshome-keyboard-click-327728.mp3";
const PIN_CLICK_VOLUME = 0.35;

export function usePinDigitClick(): () => void {
  const soundTemplateRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const sound = new Audio(PIN_CLICK_SOUND);
    sound.preload = "auto";
    soundTemplateRef.current = sound;

    return () => {
      sound.pause();
      sound.removeAttribute("src");
      sound.load();
      soundTemplateRef.current = null;
    };
  }, []);

  return useCallback(() => {
    const soundTemplate = soundTemplateRef.current;
    if (!soundTemplate) return;

    const sound = soundTemplate.cloneNode(true) as HTMLAudioElement;
    sound.volume = PIN_CLICK_VOLUME;
    void sound.play()?.catch(() => undefined);
  }, []);
}
