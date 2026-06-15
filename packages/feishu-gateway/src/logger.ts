const COLORS: Record<string, string> = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
}

function ts() {
  return new Date().toISOString().slice(11, 23)
}

export class Logger {
  private constructor(private name: string) {}

  static create(name: string) {
    return new Logger(name)
  }

  info(msg: string, extra?: unknown) {
    console.log(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.green}[${this.name}]${COLORS.reset} ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`)
  }
  warn(msg: string, extra?: unknown) {
    console.warn(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.yellow}[${this.name}]${COLORS.reset} ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`)
  }
  error(msg: string, extra?: unknown) {
    console.error(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.red}[${this.name}]${COLORS.reset} ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`)
  }
  debug(msg: string, extra?: unknown) {
    console.debug(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.cyan}[${this.name}]${COLORS.reset} ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`)
  }
}
