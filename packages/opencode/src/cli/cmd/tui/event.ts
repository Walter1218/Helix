import { BusEvent } from "@/bus/bus-event"
import { SessionID } from "@/session/schema"
import z from "zod"

export const TuiEvent = {
  PromptAppend: BusEvent.define("tui.prompt.append", z.object({ text: z.string() })),
  CommandExecute: BusEvent.define(
    "tui.command.execute",
    z.object({
      command: z.union([
        z.enum(["session.list", "session.new", "session.share", "session.interrupt", "session.compact",
          "session.page.up", "session.page.down", "session.line.up", "session.line.down",
          "session.half.page.up", "session.half.page.down", "session.first", "session.last",
          "prompt.clear", "prompt.submit", "agent.cycle"]),
        z.string(),
      ]),
    }),
  ),
  ToastShow: BusEvent.define("tui.toast.show", z.object({
    title: z.string().optional(), message: z.string(),
    variant: z.enum(["info", "success", "warning", "error"]),
    duration: z.number().default(5000).optional(),
  })),
  SessionSelect: BusEvent.define("tui.session.select", z.object({
    sessionID: SessionID.zod.describe("Session ID to navigate to"),
  })),
  InstructionsLoaded: BusEvent.define("tui.instructions.loaded", z.object({
    files: z.array(z.string()),
  })),
  StateQuery: BusEvent.define("tui.state.query", z.object({
    requestID: z.string(),
  })),
  StateResponse: BusEvent.define("tui.state.response", z.object({
    requestID: z.string(),
    state: z.object({
      route: z.enum(["home", "session", "plugin"]),
      pluginName: z.string().optional(),
      sessionID: z.string().optional(),
      dimensions: z.object({ width: z.number(), height: z.number() }),
      connected: z.boolean(), syncStatus: z.string(), ready: z.boolean(),
      mode: z.string().optional(), theme: z.string().optional(), sidebarVisible: z.boolean(),
    }),
  })),
  SnapshotQuery: BusEvent.define("tui.snapshot.query", z.object({
    requestID: z.string(), width: z.number().optional(), height: z.number().optional(),
  })),
  SnapshotResponse: BusEvent.define("tui.snapshot.response", z.object({
    requestID: z.string(), ansi: z.string(), width: z.number(), height: z.number(),
  })),
}
