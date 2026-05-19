/**
 * White Optimise Digital logo, fixed to the bottom-centre of any PIN-gate
 * login screen. Renders an <img> (not next/image) so it works inside both
 * server and client components without the App-Router boundary fuss.
 *
 * The asset lives at `/public/optimise-digital-logo-white.webp` and is the
 * 680x96 horizontal lockup. Rendered at ~180px wide so it sits as a quiet
 * brand footer rather than competing with the PIN inputs above.
 */
export default function PinGateLogo() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 32,
        transform: "translateX(-50%)",
        opacity: 0.85,
        pointerEvents: "none",
      }}
    >
      <img
        src="/optimise-digital-logo-white.webp"
        alt=""
        width={180}
        height={Math.round((180 * 96) / 680)}
        style={{ display: "block", width: 180, height: "auto" }}
      />
    </div>
  );
}
