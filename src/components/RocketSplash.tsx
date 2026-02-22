'use client'

export default function RocketSplash() {
  return (
    <div className="od-splash">
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
    </div>
  )
}
