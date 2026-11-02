import { memo } from 'react';
import { SOLAR_TONES, type SolarTone } from '../../lib/solarPhase';

/**
 * Ambient radial backlight. One layer per tone is stacked and only the active one is opaque, so
 * a phase change is a 1 s opacity cross-fade. Radial gradients stand in for a blur filter, which
 * would cost a full-size blur pass on every frame of the breathing animation.
 */
export const SolarAura = memo(function SolarAura({ tone, breathe = false, className = '' }: { tone: SolarTone; breathe?: boolean; className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none ${className}`}>
      <div className={`absolute inset-0 ${breathe ? 'animate-breathe' : ''}`} style={{ willChange: breathe ? 'transform' : undefined }}>
        {SOLAR_TONES.map((t) => (
          <div key={t} className={`solar-${t} absolute inset-0 transition-opacity duration-1000 ease-out ${t === tone ? 'opacity-100' : 'opacity-0'}`} />
        ))}
      </div>
    </div>
  );
});
