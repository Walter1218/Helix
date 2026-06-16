import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const envPath = resolve(import.meta.dir, "../.env")
try {
  const content = readFileSync(envPath, "utf-8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.log("[gateway] No .env file found, using environment variables")
}

export const config = {
  feishu: {
    appId: process.env.FEISHU_APP_ID ?? "",
    appSecret: process.env.FEISHU_APP_SECRET ?? "",
    domain: (process.env.FEISHU_DOMAIN ?? "feishu") as "feishu" | "lark",
    allowedUsers: (process.env.FEISHU_ALLOWED_USERS ?? "").split(",").filter(Boolean),
    groupMode: (process.env.FEISHU_GROUP_MODE ?? "mention") as "mention" | "always" | "off",
  },
  helix: {
    url: process.env.HELIX_URL ?? "http://localhost:3000",
    workDir: process.env.HELIX_WORK_DIR ?? process.cwd(),
    modelProvider: process.env.HELIX_MODEL_PROVIDER ?? "mimo",
    model: process.env.HELIX_MODEL ?? "mimo-v2.5-pro",
    password: process.env.MIMOCODE_SERVER_PASSWORD ?? "",
  },
}

export function validate(): string[] {
  const errors: string[] = []
  if (!config.feishu.appId || config.feishu.appId.startsWith("cli_xxx")) {
    errors.push("FEISHU_APP_ID 未设置或仍为默认值")
  }
  if (!config.feishu.appSecret || config.feishu.appSecret === "your_app_secret_here") {
    errors.push("FEISHU_APP_SECRET 未设置或仍为默认值")
  }
  return errors
}
