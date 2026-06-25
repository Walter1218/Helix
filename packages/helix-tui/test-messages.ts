import { createOpencodeClient } from "@mimo-ai/sdk/v2";

async function main() {
  const client = createOpencodeClient({
    baseUrl: "http://localhost:3095",
    headers: { Authorization: `Basic ${Buffer.from("mimocode:test123").toString("base64")}` },
  });

  try {
    const create = await client.session.create({ title: "test" });
    if (!create.data) return;

    const prompt = await client.session.prompt({
      sessionID: create.data.id,
      parts: [{ type: "text", text: "hello" }],
      agent: "build",
    });
    console.log("prompt done:", prompt.data ? "yes" : "no");

    const messages = await client.session.messages({ sessionID: create.data.id, limit: 100 });
    console.log("messages type:", typeof messages.data);
    console.log("messages is array:", Array.isArray(messages.data));
    console.log("messages data:", JSON.stringify(messages.data, null, 2));

    if (Array.isArray(messages.data)) {
      for (const msg of messages.data) {
        console.log("msg keys:", Object.keys(msg || {}));
        console.log("msg.info:", msg.info ? "exists" : "missing");
        console.log("msg.parts:", msg.parts ? "exists" : "missing");
      }
    }
  } catch (e: any) {
    console.error("ERROR:", e.message || e);
  }
}
main();
