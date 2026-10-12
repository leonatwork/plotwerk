/** Icons aus den Screens (24er-Raster, Strich 1,8, currentColor). */
import type { SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number;
}

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSchreiben = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);

export const IconKapitel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6h.5M4 12h.5M4 18h.5" />
  </Svg>
);

export const IconAkte = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M15 4v16" />
  </Svg>
);

export const IconFiguren = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

export const IconBeziehungen = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="5" cy="19" r="2.5" />
    <circle cx="19" cy="19" r="2.5" />
    <path d="M12 7.5v4M12 11.5 6.5 17M12 11.5l5.5 5.5" />
  </Svg>
);

export const IconOrte = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12Z" />
    <circle cx="12" cy="9" r="2.5" />
  </Svg>
);

export const IconHinweise = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20Z" />
    <path d="M12 10v4M12 17v.5" />
  </Svg>
);

/* Ergänzungen im selben Stil (nicht in den Screens) */

export const IconSuche = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);

export const IconSchliessen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconOrdner = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Svg>
);

export const IconDokument = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
);

// Werkzeug-Bereiche (G1–G8)

/** Zeitleiste: Uhr */
export const IconZeitleiste = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

/** Fäden: lose Enden */
export const IconFaeden = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7c4 0 4 5 8 5s4-5 8-5" />
    <path d="M4 17c4 0 4-5 8-5" />
    <circle cx="20" cy="17" r="1.2" />
  </Svg>
);

/** Statistik: Balken */
export const IconStatistik = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V6M17 16v-8" />
  </Svg>
);

/** Recherche: Klammer/Notiz */
export const IconRecherche = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 12.5 14 7a2.5 2.5 0 0 1 3.5 3.5l-7 7a4 4 0 0 1-5.7-5.7L11 5.6" />
  </Svg>
);

/** Fragen an das Buch: Sprechblase mit Fragezeichen */
export const IconFragen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12Z" />
    <path d="M10 10a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2" />
    <path d="M12 15.5h.01" />
  </Svg>
);
