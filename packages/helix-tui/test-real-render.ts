import { render } from "@opentui/solid";
import { createCliRenderer } from "@opentui/core";
import { App } from "./src/app";
import { RouteProvider } from "./src/context/route";
import { ThemeProvider } from "./src/context/theme";
import { SDKProvider } from "./src/context/sdk";
import { DialogProvider } from "./src/ui/dialog";

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
  });

  const authHeader = {
    Authorization: `Basic ${Buffer.from("mimocode:test123").toString("base64")}`,
  };

  await render(
    () => (
      <SDKProvider url="http://localhost:3095" headers={authHeader}>
        <ThemeProvider>
          <DialogProvider>
            <RouteProvider initialRoute={{ type: "chat" }}>
              <App />
            </RouteProvider>
          </DialogProvider>
        </ThemeProvider>
      </SDKProvider>
    ),
    renderer,
  );

  // Wait a bit for mount
  await new Promise((r) => setTimeout(r, 1000));

  // Simulate typing "hello" and pressing Enter
  // Note: In actual TUI, we need to use the renderer's input method
  // For now, just keep it running
  console.log("TUI started. Press Ctrl+C to exit.");
}

main().catch(console.error);
