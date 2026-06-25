import { createOpencodeClient } from "@mimo-ai/sdk/v2";

async function main() {
  const client = createOpencodeClient({
    baseUrl: process.env.HELIX_URL || "http://localhost:3095",
    headers: { Authorization: `Bearer ${process.env.MIMOCODE_SERVER_PASSWORD || "test123"}` },
  });

  try {
    console.log("=== 1. session.create ===");
    const createResult = await client.session.create({ title: "test" });
    console.log("create result type:", typeof createResult);
    console.log("create result keys:", Object.keys(createResult || {}));
    console.log("create result:", JSON.stringify(createResult, null, 2));

    if (createResult.data) {
      console.log("\n=== 2. session.prompt ===");
      const promptResult = await client.session.prompt({
        sessionID: createResult.data.id,
        parts: [{ type: "text", text: "hello" }],
        agent: "build",
      });
      console.log("prompt result type:", typeof promptResult);
      console.log("prompt result keys:", Object.keys(promptResult || {}));
      console.log("prompt result:", JSON.stringify(promptResult, null, 2));

      if (promptResult.data) {
        console.log("\n=== 3. data.parts ===");
        console.log("data:", JSON.stringify(promptResult.data, null, 2));
        console.log("data.parts:", promptResult.data.parts);
      }
    }
  } catch (e: any) {
    console.error("ERROR:", e.message || e);
    console.error("Stack:", e.stack);
  }
}

main();
