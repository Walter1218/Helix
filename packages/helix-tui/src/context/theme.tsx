import { RGBA, type TerminalColors } from "@opentui/core"
import { createSimpleContext } from "./helper"

export interface ThemeColors {
  primary: RGBA
  primaryLight: RGBA
  primaryDark: RGBA
  secondary: RGBA
  accent: RGBA
  success: RGBA
  warning: RGBA
  error: RGBA
  info: RGBA
  background: RGBA
  backgroundSecondary: RGBA
  backgroundTertiary: RGBA
  text: RGBA
  textMuted: RGBA
  textInverse: RGBA
  border: RGBA
  borderActive: RGBA
}

export interface ThemeEffects {
  glow: {
    enabled: boolean
    color: RGBA
    intensity: number
  }
  scanlines: {
    enabled: boolean
    opacity: number
  }
  gradient: {
    enabled: boolean
    colors: RGBA[]
  }
}

export interface HelixTheme {
  name: string
  colors: ThemeColors
  effects: ThemeEffects
}

const DEFAULT_THEME: HelixTheme = {
  name: "helix-cyber",
  colors: {
    primary: RGBA.fromInts(0, 200, 255),
    primaryLight: RGBA.fromInts(100, 220, 255),
    primaryDark: RGBA.fromInts(0, 150, 200),
    secondary: RGBA.fromInts(150, 100, 255),
    accent: RGBA.fromInts(255, 100, 200),
    success: RGBA.fromInts(0, 255, 150),
    warning: RGBA.fromInts(255, 200, 0),
    error: RGBA.fromInts(255, 50, 80),
    info: RGBA.fromInts(100, 180, 255),
    background: RGBA.fromInts(10, 12, 20),
    backgroundSecondary: RGBA.fromInts(15, 18, 30),
    backgroundTertiary: RGBA.fromInts(20, 25, 40),
    text: RGBA.fromInts(220, 230, 240),
    textMuted: RGBA.fromInts(120, 130, 150),
    textInverse: RGBA.fromInts(10, 12, 20),
    border: RGBA.fromInts(40, 50, 70),
    borderActive: RGBA.fromInts(0, 200, 255),
  },
  effects: {
    glow: {
      enabled: true,
      color: RGBA.fromInts(0, 200, 255),
      intensity: 0.6,
    },
    scanlines: {
      enabled: false,
      opacity: 0.1,
    },
    gradient: {
      enabled: true,
      colors: [RGBA.fromInts(0, 200, 255), RGBA.fromInts(150, 100, 255)],
    },
  },
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: (props: { theme?: HelixTheme }) => {
    const current = props.theme ?? DEFAULT_THEME

    return {
      get current() {
        return current
      },
      getColor(key: keyof ThemeColors): RGBA {
        return current.colors[key]
      },
      isGlowEnabled(): boolean {
        return current.effects.glow.enabled
      },
    }
  },
})
