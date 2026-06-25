import { createOpencodeClient } from "@mimo-ai/sdk/v2";

async function main() {
  const client = createOpencodeClient({
    baseUrl: "http://localhost:3095",
    headers: { Authorization: `Basic ${Buffer.from("mimocode:test123").toString("base64")}` },
  });

  try {
    console.log("=== create ===");
    const create = await client.session.create({ title: "test" });
    console.log("create:", JSON.stringify(create, null, 2));

    if (create.data) {
      console.log("\n=== prompt ===");
      const prompt = await client.session.prompt({
        sessionID: create.data.id,
        parts: [{ type: "text", text: "hello" }],
        agent: "build",
      });
      console.log("prompt:", JSON.stringify(prompt, null, 2));
      console.log("prompt.data:", prompt.data);
      console.log("prompt.data?.parts:", prompt.data?.parts);
      if (prompt.data && !prompt.data.parts) {
        console.log("WARNING: data exists but data.parts is missing!");
      }
    }
  } catch (e: any) {
    console.error("ERROR:", e.message || e);
    console.error("Stack:", e.stack);
  }
}
main();
