import type { ReactNode } from 'react';
import type { ToolId } from '@/game/equipment/catalog';

/**
 * Product illustrations for the Pro Supply Depot catalog: flat, readable drawings of each tool
 * in the game's palette (teal accents, safety yellow, gauge red/blue). Pure SVG, no image files.
 */

const Y = '#f2c230'; // safety yellow
const D = '#2a2f36'; // housing dark
const M = '#59616b'; // mid grey
const L = '#d7dbe0'; // light grey
const T = '#19d3c5'; // EGO teal
const R = '#e2534b';
const B = '#3f8ef0';
const S = '#a8e0ff'; // screen

const ART: Record<ToolId, ReactNode> = {
  'hand-tools': (
    <>
      <rect x="6" y="22" width="52" height="32" rx="5" fill={D} />
      <rect x="6" y="22" width="52" height="8" rx="4" fill={M} />
      <rect x="24" y="14" width="16" height="9" rx="3" fill="none" stroke={M} strokeWidth="3" />
      <rect x="12" y="34" width="4" height="16" rx="1.5" fill={Y} />
      <rect x="19" y="34" width="4" height="16" rx="1.5" fill={R} />
      <rect x="26" y="34" width="4" height="16" rx="1.5" fill={B} />
      <path d="M36 36h16M36 42h16M36 48h12" stroke={L} strokeWidth="3" strokeLinecap="round" />
      <rect x="28" y="24" width="8" height="4" rx="1" fill={T} />
    </>
  ),
  multimeter: (
    <>
      <rect x="17" y="6" width="30" height="52" rx="6" fill={Y} />
      <rect x="20" y="9" width="24" height="46" rx="4" fill={D} />
      <rect x="23" y="13" width="18" height="11" rx="2" fill={S} />
      <path d="M26 21l3-5 3 4 3-3 3 4" stroke={D} strokeWidth="1.6" fill="none" />
      <circle cx="32" cy="36" r="8" fill={M} />
      <path d="M32 36l4-5" stroke={L} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="26" cy="50" r="2.4" fill={R} />
      <circle cx="32" cy="50" r="2.4" fill={L} />
      <circle cx="38" cy="50" r="2.4" fill={D} stroke={L} strokeWidth="1" />
    </>
  ),
  'clamp-meter': (
    <>
      <path d="M32 4c-11 0-17 7-17 14h8c0-4 4-7 9-7s9 3 9 7h8c0-7-6-14-17-14z" fill={Y} />
      <rect x="18" y="20" width="28" height="38" rx="6" fill={D} />
      <rect x="22" y="24" width="20" height="10" rx="2" fill={S} />
      <text x="32" y="32.5" textAnchor="middle" fontSize="7" fontWeight="800" fill={D} fontFamily="monospace">12.4A</text>
      <circle cx="32" cy="45" r="6" fill={M} />
      <rect x="24" y="53" width="16" height="3" rx="1.5" fill={T} />
    </>
  ),
  'digital-manifold': (
    <>
      <rect x="8" y="14" width="48" height="26" rx="6" fill={D} />
      <rect x="13" y="18" width="38" height="13" rx="2" fill={S} />
      <text x="22" y="27.5" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={B} fontFamily="monospace">118</text>
      <text x="42" y="27.5" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={R} fontFamily="monospace">342</text>
      <rect x="12" y="34" width="9" height="5" rx="2" fill={B} />
      <rect x="43" y="34" width="9" height="5" rx="2" fill={R} />
      <path d="M18 40c0 10-8 10-8 18M46 40c0 10 8 10 8 18" stroke={B} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M46 40c0 10 8 10 8 18" stroke={R} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M32 40v18" stroke={Y} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  'leak-detector': (
    <>
      <rect x="22" y="24" width="20" height="34" rx="6" fill={D} />
      <rect x="25" y="28" width="14" height="8" rx="2" fill={S} />
      <path d="M27 34v-3M30 34v-4M33 34v-5M36 34v-6" stroke={R} strokeWidth="1.6" />
      <path d="M32 24c0-8 6-10 14-18" stroke={M} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="47" cy="6" r="3" fill={T} />
      <path d="M52 11a6 6 0 0 0 0-10M56 14a11 11 0 0 0 0-16" stroke={T} strokeWidth="1.6" fill="none" />
      <circle cx="32" cy="46" r="4" fill={Y} />
    </>
  ),
  manometer: (
    <>
      <rect x="16" y="12" width="32" height="44" rx="6" fill={D} />
      <rect x="20" y="16" width="24" height="14" rx="2" fill={S} />
      <text x="32" y="26" textAnchor="middle" fontSize="6" fontWeight="800" fill={D} fontFamily="monospace">0.52"</text>
      <circle cx="26" cy="40" r="3" fill={L} />
      <circle cx="38" cy="40" r="3" fill={L} />
      <rect x="22" y="48" width="20" height="4" rx="2" fill={T} />
      <path d="M26 12c0-6-8-6-8-10M38 12c0-6 8-6 8-10" stroke={M} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  'charging-scale': (
    <>
      <rect x="6" y="42" width="52" height="12" rx="4" fill={D} />
      <rect x="10" y="44" width="44" height="3" rx="1.5" fill={M} />
      <rect x="22" y="12" width="20" height="30" rx="6" fill={L} />
      <rect x="22" y="14" width="20" height="7" rx="3" fill={B} />
      <rect x="29" y="6" width="6" height="7" rx="1.5" fill={M} />
      <rect x="40" y="48" width="14" height="4" rx="1" fill={S} />
      <circle cx="12" cy="50" r="1.6" fill={T} />
    </>
  ),
  'micron-gauge': (
    <>
      <rect x="18" y="14" width="28" height="40" rx="8" fill={D} />
      <rect x="22" y="20" width="20" height="16" rx="3" fill={S} />
      <text x="32" y="31" textAnchor="middle" fontSize="7" fontWeight="800" fill={D} fontFamily="monospace">412</text>
      <text x="32" y="46" textAnchor="middle" fontSize="5.5" fontWeight="700" fill={T} fontFamily="sans-serif">MICRONS</text>
      <rect x="28" y="6" width="8" height="9" rx="2" fill={Y} />
    </>
  ),
  'vacuum-pump': (
    <>
      <rect x="8" y="26" width="34" height="22" rx="10" fill={D} />
      <rect x="40" y="22" width="16" height="28" rx="4" fill={Y} />
      <path d="M44 28h8M44 34h8M44 40h8" stroke={D} strokeWidth="2" />
      <rect x="18" y="14" width="18" height="6" rx="3" fill={M} />
      <path d="M22 20v6M32 20v6" stroke={M} strokeWidth="3" />
      <rect x="6" y="48" width="52" height="5" rx="2.5" fill={M} />
      <circle cx="16" cy="37" r="3" fill={T} />
    </>
  ),
  'recovery-machine': (
    <>
      <rect x="10" y="14" width="44" height="38" rx="6" fill={Y} />
      <rect x="14" y="18" width="36" height="14" rx="3" fill={D} />
      <circle cx="24" cy="25" r="4.5" fill={L} />
      <circle cx="40" cy="25" r="4.5" fill={L} />
      <path d="M24 25l2-3M40 25l-2-3" stroke={R} strokeWidth="1.6" />
      <rect x="18" y="38" width="28" height="9" rx="2" fill={D} />
      <circle cx="24" cy="42.5" r="2" fill={B} />
      <circle cx="32" cy="42.5" r="2" fill={R} />
      <circle cx="40" cy="42.5" r="2" fill={T} />
      <rect x="24" y="8" width="16" height="7" rx="3" fill={M} />
      <rect x="10" y="52" width="44" height="4" rx="2" fill={D} />
    </>
  ),
  'nitrogen-kit': (
    <>
      <rect x="14" y="16" width="16" height="42" rx="7" fill={L} />
      <rect x="14" y="16" width="16" height="10" rx="5" fill={M} />
      <rect x="19" y="8" width="6" height="9" rx="1.5" fill={D} />
      <text x="22" y="44" textAnchor="middle" fontSize="7" fontWeight="900" fill={D} fontFamily="sans-serif">N₂</text>
      <circle cx="44" cy="20" r="9" fill={D} />
      <circle cx="44" cy="20" r="6.5" fill="#f4f4f2" />
      <path d="M44 20l3-4" stroke={R} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M25 12h10c4 0 9 1 9 8M44 29c0 12-6 14-6 26" stroke={Y} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </>
  ),
  'thermal-camera': (
    <>
      <rect x="10" y="12" width="40" height="28" rx="6" fill={D} />
      <rect x="14" y="16" width="26" height="20" rx="2" fill="url(#ir)" />
      <circle cx="46" cy="22" r="5" fill={M} />
      <circle cx="46" cy="22" r="3" fill="#0b0f14" />
      <rect x="20" y="40" width="14" height="18" rx="4" fill={Y} />
      <rect x="22" y="44" width="4" height="6" rx="1" fill={D} />
      <defs>
        <linearGradient id="ir" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a1c71" />
          <stop offset="0.45" stopColor="#d76d77" />
          <stop offset="0.8" stopColor="#ffaf7b" />
          <stop offset="1" stopColor="#fff3b0" />
        </linearGradient>
      </defs>
    </>
  ),
};

export function ToolArt({ id, size = 64 }: { id: ToolId; size?: number }) {
  return (
    <svg className="tool-art" viewBox="0 0 64 64" width={size} height={size} role="img" aria-hidden>
      {ART[id]}
    </svg>
  );
}
