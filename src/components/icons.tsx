import type { ReactNode, SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: number
  children: ReactNode
}

function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconPlus(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function IconSearch(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </Icon>
  )
}

export function IconClose(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </Icon>
  )
}

export function IconMinus(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M5.5 12h13" />
    </Icon>
  )
}

export function IconPin(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M9.5 3.5h5v2h-1v4.2l3 3.1v2.2h-4.5v5.5" />
      <path d="M12 20v-1" />
      <path d="M7.5 12.8v-2.2l3-3.1V5.5h-1" />
    </Icon>
  )
}

export function IconChevronUp(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M6 15l6-6 6 6" />
    </Icon>
  )
}

export function IconChevronDown(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  )
}

export function IconTrash(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.8h5V7" />
      <path d="M6.6 7l.9 12.2h9l.9-12.2" />
      <path d="M10.5 10.5v5.5M13.5 10.5v5.5" />
    </Icon>
  )
}

export function IconCheck(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M5 12.8 9.6 17.4 19 8" />
    </Icon>
  )
}

export function IconArchive(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <rect x="3.4" y="4.4" width="17.2" height="4.4" rx="1.8" />
      <path d="M5.2 8.8h13.6v9.6a1.8 1.8 0 0 1-1.8 1.8H7a1.8 1.8 0 0 1-1.8-1.8V8.8Z" />
      <path d="M10 12.4h4" />
    </Icon>
  )
}

export function IconRestore(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
      <path d="M4.2 4.6v3.8h3.8" />
    </Icon>
  )
}

export function IconImage(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <rect x="3.6" y="4.6" width="16.8" height="14.8" rx="3" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4.6 17.4l4.3-4.1a1.8 1.8 0 0 1 2.5 0l3.2 3.1" />
      <path d="M14.2 15.2l1.6-1.5a1.8 1.8 0 0 1 2.5 0l2.1 2" />
    </Icon>
  )
}

export function IconFile(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M13.4 3.6H7.4a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h9.2a2 2 0 0 0 2-2V8.8l-5.2-5.2Z" />
      <path d="M13.4 3.6v5.2h5.2" />
    </Icon>
  )
}

export function IconLink(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l2.7-2.7a3.6 3.6 0 0 0-5.1-5.1l-1.2 1.2" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-2.7 2.7a3.6 3.6 0 0 0 5.1 5.1l1.2-1.2" />
    </Icon>
  )
}

export function IconExternal(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M13.6 4.4h6v6" />
      <path d="M19.6 4.4 12.4 11.6" />
      <path d="M18.4 14.2v4.2a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.4V7.6a1.8 1.8 0 0 1 1.8-1.8h4.2" />
    </Icon>
  )
}

export function IconSun(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.1M12 19.1v2.1M4.5 4.5l1.5 1.5M18 18l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.5 19.5 6 18M18 6l1.5-1.5" />
    </Icon>
  )
}

export function IconMoon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6Z" />
    </Icon>
  )
}

export function IconMonitor(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <rect x="2.8" y="4.2" width="18.4" height="12.4" rx="2.2" />
      <path d="M9 20.2h6M12 16.6v3.6" />
    </Icon>
  )
}

export function IconGrid(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </Icon>
  )
}

export function IconLayers(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="3.5" width="14" height="11" rx="2.6" />
      <path d="M16.5 17.5a2.6 2.6 0 0 1-2.6 2.6H6.2a2.6 2.6 0 0 1-2.6-2.6v-7.2" />
    </Icon>
  )
}

export function IconSliders(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <circle cx="9" cy="7" r="2" fill="var(--nm-bg)" />
      <circle cx="15" cy="12" r="2" fill="var(--nm-bg)" />
      <circle cx="8" cy="17" r="2" fill="var(--nm-bg)" />
    </Icon>
  )
}

export function IconSparkle(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5Z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
    </Icon>
  )
}

export function IconResize(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M13.5 20h6.5v-6.5" />
      <path d="M20 20l-6.8-6.8" />
    </Icon>
  )
}

export function IconEraser(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M8.4 20.2H4.6l-1-1a2 2 0 0 1 0-2.8L12 6.8a2 2 0 0 1 2.8 0l4.4 4.4a2 2 0 0 1 0 2.8l-6.6 6.6H8.4Z" />
      <path d="M7.4 11.4 14.6 18.6" />
    </Icon>
  )
}
