'use client'

/**
 * The Optimise Digital rocket, shown while a page loads.
 *
 * `onLight` is opt-in rather than detected: the source logo is black and the
 * dark dashboards invert it to white, which leaves it invisible on a light
 * surface. Callers on a light background ask for the un-inverted mark, so no
 * existing dark usage changes.
 *
 * Compact injects its own CSS so the OptiMate popout (no admin stylesheet)
 * still gets the animation.
 */
const COMPACT_CSS = `
.od-splash--compact{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:160px;height:100%;width:100%;padding:12px;gap:10px;overflow:hidden}
.od-splash--compact .od-splash__scene{position:relative;width:64px;height:110px}
.od-splash--compact .od-splash__rocket{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);animation:od-rocket-offset-loop 2.6s cubic-bezier(.4,0,.2,1) infinite;z-index:2}
.od-splash--compact .od-splash__rocket img{display:block;width:36px;height:36px;object-fit:contain;transform:rotate(-30deg)}
.od-splash--compact .od-splash__flames{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:20px;height:60px;animation:od-rocket-loop 2.6s cubic-bezier(.4,0,.2,1) infinite;z-index:1}
.od-splash--compact .od-splash__flame{position:absolute;bottom:0;border-radius:50%}
.od-splash--compact .od-splash__flame--1{width:10px;height:28px;left:5px;background:linear-gradient(to top,transparent,#f59e0b,#ef4444);border-radius:50% 50% 40% 40%;opacity:0;animation:od-flame-loop 2.6s cubic-bezier(.4,0,.2,1) infinite,od-flame-flicker .15s ease-in-out infinite alternate}
.od-splash--compact .od-splash__flame--2{width:6px;height:18px;left:2px;background:linear-gradient(to top,transparent,#fbbf24);border-radius:50% 50% 40% 40%;opacity:0;animation:od-flame-loop 2.6s cubic-bezier(.4,0,.2,1) .08s infinite,od-flame-flicker .2s ease-in-out infinite alternate}
.od-splash--compact .od-splash__flame--3{width:6px;height:20px;left:10px;background:linear-gradient(to top,transparent,#fb923c);border-radius:50% 50% 40% 40%;opacity:0;animation:od-flame-loop 2.6s cubic-bezier(.4,0,.2,1) .04s infinite,od-flame-flicker .18s ease-in-out infinite alternate}
.od-splash--compact .od-splash__text{font-size:12px;font-weight:500;color:#6b7280;letter-spacing:.5px}
@keyframes od-rocket-loop{0%{transform:translateX(calc(-50% - 5px)) translateY(0);opacity:0}8%{transform:translateX(calc(-50% - 5px)) translateY(0);opacity:1}18%{transform:translateX(calc(-50% - 5px)) translateY(2px);opacity:1}32%{transform:translateX(calc(-50% - 5px)) translateY(-6px);opacity:1}78%{transform:translateX(calc(-50% - 5px)) translateY(-130px);opacity:1}92%,100%{transform:translateX(calc(-50% - 5px)) translateY(-220px);opacity:0}}
@keyframes od-rocket-offset-loop{0%{transform:translateX(calc(-50% - 7px)) translateY(0);opacity:0}8%{transform:translateX(calc(-50% - 7px)) translateY(0);opacity:1}18%{transform:translateX(calc(-50% - 7px)) translateY(2px);opacity:1}32%{transform:translateX(calc(-50% - 7px)) translateY(-6px);opacity:1}78%{transform:translateX(calc(-50% - 7px)) translateY(-130px);opacity:1}92%,100%{transform:translateX(calc(-50% - 7px)) translateY(-220px);opacity:0}}
@keyframes od-flame-loop{0%{opacity:0;transform:scaleY(.2)}10%{opacity:.6;transform:scaleY(.4)}22%{opacity:.9;transform:scaleY(.6)}36%{opacity:1;transform:scaleY(1)}76%{opacity:1;transform:scaleY(1.4)}90%{opacity:0;transform:scaleY(1.8)}100%{opacity:0;transform:scaleY(.2)}}
@keyframes od-flame-flicker{0%{transform:scaleX(.85) translateX(-1px)}100%{transform:scaleX(1.15) translateX(1px)}}
@media (prefers-reduced-motion:reduce){.od-splash--compact .od-splash__rocket,.od-splash--compact .od-splash__flames,.od-splash--compact .od-splash__flame{animation:none!important;opacity:1;transform:translateX(-50%)}}
`

export default function RocketSplash({
  onLight = false,
  compact = false,
}: {
  onLight?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={`od-splash${onLight ? ' od-splash--light' : ''}${compact ? ' od-splash--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="od-splash__scene">
        <div className="od-splash__flames">
          <div className="od-splash__flame od-splash__flame--1" />
          <div className="od-splash__flame od-splash__flame--2" />
          <div className="od-splash__flame od-splash__flame--3" />
        </div>
        <div className="od-splash__rocket">
          <img src="/optimise-rocket-logo-black.png" alt="" width={48} height={48} />
        </div>
      </div>
      <div className="od-splash__text">Loading</div>
      {compact ? <style>{COMPACT_CSS}</style> : null}
    </div>
  )
}
