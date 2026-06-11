import type { CSSProperties, ReactElement, ReactNode } from "react";
import PinGateLogo from "./PinGateLogo";

const spaceGrotesk = "var(--font-space-grotesk), system-ui, sans-serif";
const jetbrainsMono = "var(--font-jetbrains-mono), ui-monospace, monospace";

export const pinGateInputStyle: CSSProperties = {
  width: 76,
  height: 92,
  borderRadius: 18,
  textAlign: "center",
  fontFamily: spaceGrotesk,
  fontSize: 34,
  fontWeight: 600,
  color: "#ffffff",
  caretColor: "#4d94ff",
  outline: "none",
  background: "linear-gradient(180deg, rgba(17,22,46,0.9) 0%, rgba(11,18,38,0.9) 100%)",
  border: "1px solid rgba(153,192,255,0.18)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export const pinGateFocusedInputStyle: Pick<CSSProperties, "border" | "boxShadow"> = {
  border: "2px solid #4d94ff",
  boxShadow: "0 0 0 4px rgba(0,102,255,0.18), 0 8px 24px rgba(0,0,0,0.35)",
};

export const pinGateBlurredInputStyle: Pick<CSSProperties, "border" | "boxShadow"> = {
  border: "1px solid rgba(153,192,255,0.18)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
};

interface PinGateFrameProps {
  eyebrow: string;
  title?: string;
  subtitle: string;
  children: ReactNode;
}

export function PinGateFrame({ eyebrow, title, subtitle, children }: PinGateFrameProps): ReactElement {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
        background: "radial-gradient(1200px 700px at 50% 18%, #11162e 0%, #0b1226 45%, #07091a 100%)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: [
            "radial-gradient(1.5px 1.5px at 12% 22%, rgba(255,255,255,0.55), transparent)",
            "radial-gradient(1.5px 1.5px at 78% 14%, rgba(255,255,255,0.45), transparent)",
            "radial-gradient(1px 1px at 33% 68%, rgba(255,255,255,0.4), transparent)",
            "radial-gradient(1px 1px at 64% 82%, rgba(255,255,255,0.35), transparent)",
            "radial-gradient(2px 2px at 88% 56%, rgba(153,192,255,0.5), transparent)",
            "radial-gradient(1.5px 1.5px at 22% 88%, rgba(255,255,255,0.3), transparent)",
            "radial-gradient(1px 1px at 50% 38%, rgba(255,255,255,0.3), transparent)",
          ].join(","),
        }}
      />

      <div style={{ position: "relative", textAlign: "center", marginBottom: 44 }}>
        {title ? (
          <div
            style={{
              fontFamily: spaceGrotesk,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#4d94ff",
              marginBottom: 18,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1
          style={{
            fontFamily: spaceGrotesk,
            fontSize: 52,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            margin: 0,
          }}
        >
          {title || eyebrow}
        </h1>
      </div>

      {children}

      <p
        style={{
          position: "relative",
          fontFamily: jetbrainsMono,
          fontSize: 13,
          letterSpacing: "0.02em",
          color: "#8b90ad",
          marginTop: 30,
        }}
      >
        {subtitle}
      </p>
      <PinGateLogo />
    </div>
  );
}
