import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  src: string
  /** Chế độ thi: không tua, không đổi tốc độ – giống phòng thi thật. */
  locked?: boolean
  autoPlay?: boolean
  compact?: boolean
}

const SPEEDS = [0.75, 1, 1.25]

function seeded(src: string, n: number) {
  let h = 0
  for (const c of src) h = (h * 31 + c.charCodeAt(0)) | 0
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345 + i) | 0
    return 0.25 + (Math.abs(h) % 1000) / 1000 * 0.75
  })
}

export function AudioPlayer({ src, locked = false, autoPlay = false, compact = false }: Props) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [plays, setPlays] = useState(0)
  const bars = useMemo(() => seeded(src, compact ? 36 : 56), [src, compact])

  useEffect(() => {
    setPlaying(false); setTime(0); setPlays(0)
    const a = ref.current
    if (a && autoPlay) a.play().catch(() => {})
  }, [src, autoPlay])

  useEffect(() => { if (ref.current) ref.current.playbackRate = speed }, [speed])

  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) {
      if (locked && plays > 0 && a.ended) return
      void a.play()
    } else if (!locked) a.pause()
  }

  const restart = () => {
    const a = ref.current
    if (!a || locked) return
    a.currentTime = 0
    void a.play()
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (locked || !ref.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    ref.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const progress = duration ? time / duration : 0
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const finishedLocked = locked && plays > 0 && !playing && progress >= 0.999

  return (
    <div className={clsx('flex items-center gap-3 rounded-2xl bg-ink text-white', compact ? 'p-2.5' : 'p-3.5 sm:p-4')}>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => { setPlaying(true); setPlays((p) => p + 1) }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button
        type="button"
        onClick={toggle}
        disabled={finishedLocked}
        aria-label={playing ? 'Tạm dừng' : 'Phát audio'}
        className={clsx(
          'grid shrink-0 place-items-center rounded-full bg-hl text-graphite transition hover:scale-105 disabled:opacity-40',
          compact ? 'h-9 w-9' : 'h-12 w-12',
        )}
      >
        {playing ? <Pause size={compact ? 16 : 20} fill="currentColor" /> : <Play size={compact ? 16 : 20} fill="currentColor" className="ml-0.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={clsx('flex items-center gap-[3px]', compact ? 'h-7' : 'h-10', !locked && 'cursor-pointer')}
          onClick={seek}
          role="presentation"
        >
          {bars.map((b, i) => {
            const active = i / bars.length < progress
            return (
              <span
                key={i}
                className={clsx('flex-1 rounded-full transition-colors duration-200', active ? 'bg-hl' : 'bg-white/25')}
                style={{
                  height: `${b * 100}%`,
                  animation: playing ? `bar-pulse 1.1s ${(i % 7) * 0.09}s ease-in-out infinite` : undefined,
                }}
              />
            )
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-white/60">
          <span>{fmt(time)}</span>
          <span>
            {locked ? (finishedLocked ? 'Đã phát xong · chỉ nghe 1 lần' : 'Chế độ thi · nghe 1 lần') : fmt(duration)}
          </span>
        </div>
      </div>

      {!locked && !compact && (
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <button type="button" onClick={restart} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Nghe lại từ đầu">
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
            className="rounded-full px-2.5 py-1.5 font-mono text-xs font-bold hover:bg-white/10"
            aria-label="Đổi tốc độ phát"
          >
            {speed}×
          </button>
        </div>
      )}
      <style>{`@keyframes bar-pulse { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(0.55) } }`}</style>
    </div>
  )
}
