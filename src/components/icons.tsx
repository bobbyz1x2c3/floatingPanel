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

export function IconPalette(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.8 1.9-1.7 0-1.5-1.3-1.8-1.3-3 0-.9.8-1.6 1.8-1.6h1.4c2.1 0 3.7-1.5 3.7-3.6C19.5 6.4 16.2 3.5 12 3.5Z" />
      <circle cx="8.6" cy="10.6" r="0.9" />
      <circle cx="12" cy="8" r="0.9" />
      <circle cx="15.4" cy="10.2" r="0.9" />
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

export function IconEyeOff(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M4 12s3-5.2 8-5.2c1.2 0 2.3.3 3.2.8" />
      <path d="M20 12s-3 5.2-8 5.2c-1.2 0-2.3-.3-3.2-.8" />
      <path d="M4 4l16 16" />
      <path d="M10.2 10.4a2.4 2.4 0 0 0 3.4 3.4" />
    </Icon>
  )
}

export function IconDroplet(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M12 3.6c3.2 3.6 5.2 6.3 5.2 8.6a5.2 5.2 0 0 1-10.4 0c0-2.3 2-5 5.2-8.6Z" />
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

export function IconEraser(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <path d="M8.4 20.2H4.6l-1-1a2 2 0 0 1 0-2.8L12 6.8a2 2 0 0 1 2.8 0l4.4 4.4a2 2 0 0 1 0 2.8l-6.6 6.6H8.4Z" />
      <path d="M7.4 11.4 14.6 18.6" />
    </Icon>
  )
}
