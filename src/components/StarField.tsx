/**
 * StarField — renders a dense star field using box-shadow.
 * Server component — star positions are generated at render time.
 * Uses a seeded PRNG so positions are consistent per seed value.
 */

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return s / 2147483647
  }
}

interface StarLayer {
  count: number
  minSize: number
  maxSize: number
  minOpacity: number
  maxOpacity: number
  animationName: string
  animationDuration: string
}

const LAYERS: StarLayer[] = [
  { count: 120, minSize: 0.4, maxSize: 0.8, minOpacity: 0.15, maxOpacity: 0.4, animationName: 'star-twinkle-1', animationDuration: '4s' },
  { count: 90, minSize: 0.8, maxSize: 1.2, minOpacity: 0.25, maxOpacity: 0.55, animationName: 'star-twinkle-2', animationDuration: '5s' },
  { count: 60, minSize: 1.2, maxSize: 1.8, minOpacity: 0.35, maxOpacity: 0.65, animationName: 'star-twinkle-1', animationDuration: '6s' },
  { count: 30, minSize: 1.8, maxSize: 2.5, minOpacity: 0.5, maxOpacity: 0.8, animationName: 'star-twinkle-2', animationDuration: '4.5s' },
  { count: 15, minSize: 2.5, maxSize: 3.5, minOpacity: 0.6, maxOpacity: 0.9, animationName: 'star-twinkle-1', animationDuration: '5.5s' },
]

export default function StarField({ seed = 42 }: { seed?: number }) {
  const rand = seededRandom(seed)

  return (
    <>
      {LAYERS.map((layer, li) => {
        const shadows: string[] = []
        for (let i = 0; i < layer.count; i++) {
          const x = (rand() * 100).toFixed(2)
          const y = (rand() * 100).toFixed(2)
          const size = layer.minSize + rand() * (layer.maxSize - layer.minSize)
          const opacity = layer.minOpacity + rand() * (layer.maxOpacity - layer.minOpacity)
          shadows.push(`${x}vw ${y}dvh 0 ${(size / 2).toFixed(1)}px rgba(255,255,255,${opacity.toFixed(2)})`)
        }
        return (
          <div
            key={li}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: '1px',
                height: '1px',
                top: 0,
                left: 0,
                boxShadow: shadows.join(', '),
                animation: `${layer.animationName} ${layer.animationDuration} ease-in-out infinite alternate`,
              }}
            />
          </div>
        )
      })}
    </>
  )
}
