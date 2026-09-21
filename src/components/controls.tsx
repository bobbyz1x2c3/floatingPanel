import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react'

type NeuButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
  active?: boolean
  iconOnly?: boolean
}

export function NeuButton({
  variant = 'default',
  size = 'md',
  active = false,
  iconOnly = false,
  className,
  type = 'button',
  ...rest
}: NeuButtonProps) {
  const classes = [
    'nm-btn',
    size === 'sm' && 'nm-btn--sm',
    variant !== 'default' && `nm-btn--${variant}`,
    iconOnly && 'nm-btn--icon',
    active && 'is-active',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <button type={type} className={classes} {...rest} />
}

interface NeuSwitchProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}

export function NeuSwitch({ checked, onChange, label, disabled = false }: NeuSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`nm-switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="nm-switch__knob" />
    </button>
  )
}

type NeuSliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function NeuSlider({ className, ...rest }: NeuSliderProps) {
  return <input type="range" className={['nm-range', className].filter(Boolean).join(' ')} {...rest} />
}

interface NeuFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>
}

export function NeuField({ className, ...rest }: NeuFieldProps) {
  return <input className={['nm-field', className].filter(Boolean).join(' ')} {...rest} />
}

interface NeuChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  tone?: string
}

export function NeuChip({ active = false, tone, className, children, ...rest }: NeuChipProps) {
  return (
    <button
      type="button"
      className={['nm-chip', active && 'is-active', className].filter(Boolean).join(' ')}
      data-tone={tone}
      aria-pressed={active}
      {...rest}
    >
      {tone ? <span className="nm-chip__dot" /> : null}
      {children}
    </button>
  )
}

interface DrawerRowProps {
  title: string
  hint?: string
  children: ReactNode
}

export function DrawerRow({ title, hint, children }: DrawerRowProps) {
  return (
    <div className="drawer__row">
      <div className="drawer__row-text">
        <div className="drawer__row-title">{title}</div>
        {hint ? <div className="drawer__row-hint">{hint}</div> : null}
      </div>
      {children}
    </div>
  )
}
