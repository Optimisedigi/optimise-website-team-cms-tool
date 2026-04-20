# Fix Voice Transcription & Add Mobile Support

## Problem Analysis

### Bug: Recording turns off immediately
The `VoiceField` component (`src/components/VoiceField.tsx`) uses the Web Speech API (`SpeechRecognition`) with `continuous = true`. The issue is in the `onend` handler (line 155-166):

```js
recognition.onend = () => {
  if (!isManualStopRef.current) {
    setRecordingState('idle')  // ← This kills it immediately
  }
}
```

When `SpeechRecognition` fires `onend` unexpectedly (browser timeout, silence, mobile quirks), the component transitions to `idle` and stops. The `onend` handler should **auto-restart** recognition instead of giving up.

Currently, only `onerror` with `no-speech` triggers a restart (lines 134-146). But the browser also fires `onend` without any error — especially on mobile Safari and Chrome Android where `continuous` mode is poorly supported.

### Mobile: Web Speech API is available but flaky
Research findings:
- **Mobile Safari (14.1+)** partially supports Web Speech API — but has event quirks that cause `onend` to fire unexpectedly
- **Chrome on Android** works best of all mobile browsers
- **Chrome on iOS** does NOT support it (uses WebKit engine, not Chromium's speech engine)
- **Firefox** doesn't support it at all

### Cost-conscious approach
The Web Speech API is **free** — it runs in the browser using Google/Apple's built-in speech services. Gemini API costs tokens/money per call.

**Strategy: maximise free API usage, Gemini only as last resort**
- Fix the `onend` auto-restart → this fixes desktop + mobile Safari + Chrome Android (vast majority of users). Zero cost.
- Only fall back to Gemini for browsers where Web Speech API is genuinely unavailable (Chrome on iOS, Firefox). These are rare edge cases for your team.

## Files to Change

- `src/components/VoiceField.tsx` — Fix `onend` auto-restart + add MediaRecorder/Gemini fallback for unsupported browsers only
- `src/components/VoiceField.css` — Add processing/transcribing indicator styles
- `src/app/(frontend)/api/transcribe/route.ts` — **NEW**: Gemini audio transcription endpoint (only called when Web Speech API is unavailable)

## Steps

1. Create new API route `src/app/(frontend)/api/transcribe/route.ts` that accepts a base64-encoded audio blob (webm format), sends it to Gemini via `@google/genai` `ai.models.generateContent()` with inline audio data and the prompt "Transcribe this audio. Return only the transcribed text, no formatting or explanations. Use Australian English spelling.", and returns `{ text: string }`. This endpoint is only called when the browser doesn't support Web Speech API.

2. In `src/components/VoiceField.tsx`, fix the `onend` handler (line 155) to auto-restart recognition when `isManualStopRef.current` is false — add a setTimeout retry similar to the existing `no-speech` error handler, with a max-restart counter (e.g. 5 restarts without any successful result) to avoid infinite loops, and a `restartCountRef` that resets to 0 whenever `onresult` fires with a final result.

3. In `src/components/VoiceField.tsx`, add a MediaRecorder-based recording mode as a fallback that is **only used when `isSupported` is false** (i.e. Web Speech API is unavailable). When in fallback mode, `startRecording` uses `navigator.mediaDevices.getUserMedia({ audio: true })` + `MediaRecorder` to record audio chunks into a webm blob. `stopRecording` stops the MediaRecorder, assembles the Blob, converts to base64, POSTs to `/api/transcribe`, and appends the returned text to the field value. Show `recordingState = 'processing'` while waiting for the API. Enable the mic button even when `!isSupported` (remove the `disabled={!isSupported}` condition) as long as MediaRecorder is available. Only show "Voice not supported" badge when neither API is available.

4. Update `src/components/VoiceField.css` to add a small "Transcribing..." text style below the mic button for the processing state, so the user knows the audio is being sent to the server. Verify the existing `.mic-icon.processing` spinner animation is visually clear.

5. Run `npx tsc --noEmit` to verify no type errors, then run `npm test` to verify no test failures.
