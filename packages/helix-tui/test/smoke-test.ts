#!/usr/bin/env bun --conditions=browser
import { createOpencodeClient } from "@mimo-ai/sdk/v2"

const client = createOpencodeClient({ baseUrl: "http://localhost:3096" })

const session = await client.session.create({ title: "Smoke Test" })
console.log("Session result:", JSON.stringify(session).slice(0, 500))
console.log("Error:", session.error ? JSON.stringify(session.error).slice(0, 300) : "none")
