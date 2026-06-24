import type { RGBA } from "@opentui/core"

export interface GlowButtonProps {
  children: any
  onClick?: () => void
  color?: RGBA
  disabled?: boolean
}

export function GlowButton(props: GlowButtonProps) {
  return (
    <box
      flexDirection="row"
      padding={1}
      border
      borderColor={props.color}
      onMouseDown={props.onClick}
    >
      <text fg={props.color}>{props.children}</text>
    </box>
  )
}

export interface NeonTextProps {
  children: any
  color?: RGBA
  bold?: boolean
}

export function NeonText(props: NeonTextProps) {
  return (
    <text
      fg={props.color}
      attributes={props.bold ? 1 : 0}
    >
      {props.children}
    </text>
  )
}

export interface PanelProps {
  children: any
  title?: string
  color?: RGBA
}

export function Panel(props: PanelProps) {
  return (
    <box
      flexDirection="column"
      border
      borderColor={props.color}
      padding={1}
    >
      {props.title && (
        <text fg={props.color} attributes={1}>
          {props.title}
        </text>
      )}
      {props.children}
    </box>
  )
}

export interface ProgressBarProps {
  value: number
  max?: number
  width?: number
  color?: RGBA
  bgColor?: RGBA
}

export function ProgressBar(props: ProgressBarProps) {
  const max = props.max || 100
  const width = props.width || 20
  const filled = Math.round((props.value / max) * width)
  const empty = width - filled

  return (
    <text>
      <text fg={props.color}>{"█".repeat(filled)}</text>
      <text fg={props.bgColor}>{"░".repeat(empty)}</text>
    </text>
  )
}

export interface GaugeProps {
  value: number
  label: string
  color?: RGBA
  warningColor?: RGBA
  errorColor?: RGBA
  warningThreshold?: number
  errorThreshold?: number
}

export function Gauge(props: GaugeProps) {
  const warningThreshold = props.warningThreshold || 70
  const errorThreshold = props.errorThreshold || 90
  const color = props.value > errorThreshold
    ? props.errorColor
    : props.value > warningThreshold
      ? props.warningColor
      : props.color

  return (
    <box flexDirection="row">
      <text fg={color}>{props.label}: </text>
      <ProgressBar
        value={props.value}
        width={20}
        color={color}
      />
      <text fg={color}> {props.value.toFixed(1)}%</text>
    </box>
  )
}
