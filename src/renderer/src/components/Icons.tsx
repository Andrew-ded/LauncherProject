import type { ReactNode, SVGProps } from 'react'

// Простые штриховые иконки. Цвет берут из currentColor.

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: P & { children: ReactNode }) {
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
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)

export const IconPlus = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconFolder = (p: P) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
)

export const IconNotes = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5M9 12h7M9 16h5" />
  </Svg>
)

export const IconBranch = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <circle cx="6" cy="5" r="2" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M6 7v10M18 10c0 4-6 4-12 7" />
  </Svg>
)

export const IconPr = (p: P) => (
  <Svg strokeWidth={1.9} {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4M13 4l-2 2 2 2" />
  </Svg>
)

export const IconIssue = (p: P) => (
  <Svg strokeWidth={1.9} {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="1.5" />
  </Svg>
)

export const IconExternal = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
)

export const IconClose = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a1 1 0 0 1 1-1h9" />
  </Svg>
)

export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
)

export const IconSettings = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
)

export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" />
  </Svg>
)

export const IconWarn = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17v.5" />
  </Svg>
)

export const IconCode = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="m8 8-4 4 4 4M16 8l4 4-4 4" />
  </Svg>
)

export const IconFolderSearch = (p: P) => (
  <Svg {...p}>
    <path d="M10 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2.5" />
    <circle cx="16.5" cy="16.5" r="3" />
    <path d="m21 21-2.4-2.4" />
  </Svg>
)
