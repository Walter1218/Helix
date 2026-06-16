import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptionsNoConfig } from "../network"
import { Flag } from "../../flag/flag"
import { AppRuntime } from "@/effect/app-runtime"
import { Config } from "@/config"
import { bootstrap } from "../bootstrap"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless mimocode server",
  handler: async (args) => {
    if (!Flag.MIMOCODE_SERVER_PASSWORD) {
      console.log("Warning: MIMOCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    // 在 Instance 上下文中获取配置并启动服务器
    await bootstrap(process.cwd(), async () => {
      let config: Config.Info | undefined
      try {
        config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
      } catch {
        config = undefined
      }
      const opts = resolveNetworkOptionsNoConfig(args, config)
      const server = await Server.listen(opts)
      console.log(`mimocode server listening on http://${server.hostname}:${server.port}`)

      await new Promise(() => {})
      await server.stop()
    })
  },
})
