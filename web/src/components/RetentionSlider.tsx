import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react";

import {
  ANONYMOUS_LIMIT_RATIO,
  clampDurationDays,
  daysToRatio,
  MAX_PERSONAL_DAYS,
  ratioToDays,
  RETENTION_SCALE_TICKS,
} from "../retention-scale";

type RetentionSliderProps = {
  value: number;
  maxDays: number;
  onChange: (days: number) => void;
};

export function RetentionSlider({ value, maxDays, onChange }: RetentionSliderProps) {
  const labelId = useId();
  const hintId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const limited = maxDays < MAX_PERSONAL_DAYS;
  const ratio = daysToRatio(value);
  const fillPercent = `${ratio * 100}%`;
  const barrierPercent = `${ANONYMOUS_LIMIT_RATIO * 100}%`;

  function setDaysFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const nextRatio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    onChange(clampDurationDays(ratioToDays(nextRatio), maxDays));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - 1;
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = maxDays;
    else if (event.key === "PageUp") next = value + 5;
    else if (event.key === "PageDown") next = value - 5;
    if (next == null) return;
    event.preventDefault();
    onChange(clampDurationDays(next, maxDays));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDaysFromClientX(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    setDaysFromClientX(event.clientX);
  }

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="retention-slider">
      <div className="retention-slider-head">
        <span id={labelId}>链接保留时长</span>
        <strong aria-hidden="true">保留 {value} 天</strong>
      </div>
      <div
        className={`retention-slider-control${limited ? " is-limited" : ""}`}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-describedby={limited ? hintId : undefined}
        aria-valuemin={1}
        aria-valuemax={maxDays}
        aria-valuenow={value}
        aria-valuetext={`保留 ${value} 天`}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div className="retention-slider-track-wrap">
          <div ref={trackRef} className="retention-slider-track" data-testid="retention-slider-track">
            <div className="retention-slider-fill" style={{ width: fillPercent }} />
            {limited && <div className="retention-slider-locked" style={{ left: barrierPercent }} />}
            <div
              className="retention-slider-barrier"
              style={{ left: barrierPercent }}
              aria-hidden="true"
            />
            <div className="retention-slider-thumb" style={{ left: fillPercent }} />
          </div>
        </div>
        <div className="retention-slider-scale" aria-hidden="true">
          {RETENTION_SCALE_TICKS.map((days) => {
            const atStart = days === 1;
            const atEnd = days === MAX_PERSONAL_DAYS;
            return (
              <span
                key={days}
                className={atEnd ? "retention-slider-scale-end" : undefined}
                style={{ left: atStart ? "0%" : atEnd ? "100%" : `${daysToRatio(days) * 100}%` }}
              >
                {days}
              </span>
            );
          })}
        </div>
      </div>
      {limited && (
        <p id={hintId} className="retention-slider-hint">
          登录后可延长至 {MAX_PERSONAL_DAYS} 天
        </p>
      )}
    </div>
  );
}
