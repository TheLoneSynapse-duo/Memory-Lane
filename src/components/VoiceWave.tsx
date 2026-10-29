import { useEffect, useRef } from "react";
import { agentLevels } from "../data/voiceAgent";

/**
 * The wave under the status line, so a wait is seen rather than endured.
 *
 * Nine bars shaped by the audio the call is already carrying: the microphone
 * while it listens, the reply while it speaks, and a pulse travelling along
 * the bars in the gap between a question and its answer — the moment that
 * used to be silence with nothing to show for it.
 *
 * Heights are written straight onto the DOM on every frame, so the meter
 * never re-renders the transcript next to it, and with reduced motion asked
 * for it settles into a still meter instead of moving at all.
 */
export type WaveMode = "connecting" | "listening" | "thinking" | "speaking";

const BAR_COUNT = 9;

const TONE: Record<WaveMode, string> = {
  connecting: "text-ink-soft/50",
  listening: "text-terracotta",
  thinking: "text-ochre",
  speaking: "text-sage-deep",
};

export default function VoiceWave({ mode }: { mode: WaveMode }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const paint = (index: number, height: number) => {
      const bar = bars.current[index];
      if (bar) bar.style.transform = `scaleY(${height.toFixed(3)})`;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let index = 0; index < BAR_COUNT; index += 1) paint(index, 0.45);
      return;
    }

    const heights = new Array(BAR_COUNT).fill(0.3);
    const middle = (BAR_COUNT - 1) / 2;
    let frame = 0;

    const tick = () => {
      const now = performance.now() / 1000;
      const levels = agentLevels();
      const level = mode === "speaking" ? levels.reply : mode === "listening" ? levels.mic : 0;

      for (let index = 0; index < BAR_COUNT; index += 1) {
        // The bars in the middle ride higher, so the shape reads as a voice.
        const centre = 1 - Math.abs(index - middle) / middle;
        const breathe = 0.5 + 0.5 * Math.sin(now * (mode === "connecting" ? 1.6 : 2.6) - index * 0.8);

        let target: number;
        if (mode === "thinking") {
          // One pulse running along the bars: something is on its way.
          const travel = 0.5 + 0.5 * Math.sin(now * 4.5 - index * 0.95);
          target = 0.16 + travel * travel * 0.78;
        } else if (mode === "connecting") {
          target = 0.2 + breathe * 0.35;
        } else {
          target = 0.14 + breathe * 0.16 + level * (0.6 + 0.5 * centre);
        }

        // Ease towards the target rather than jumping, so a loud syllable
        // swells and fades instead of snapping.
        heights[index] += (Math.min(1, Math.max(0.12, target)) - heights[index]) * 0.3;
        paint(index, heights[index]);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  return (
    <div className={`flex items-center justify-center gap-1.5 ${TONE[mode]}`} aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <span
          key={index}
          ref={(node) => {
            bars.current[index] = node;
          }}
          className="block h-9 w-1.5 rounded-full bg-current"
          style={{ transform: "scaleY(0.3)", transformOrigin: "center" }}
        />
      ))}
    </div>
  );
}
