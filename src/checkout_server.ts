import { createServer } from "node:http";
import { APIError } from "openai";
import { ZodError } from "zod";
import {
  checkoutRequestSchema,
  createInfraiGenerator,
  prepareCustomerUpdate
} from "./order_update_service.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const generate = createInfraiGenerator(apiKey);

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.method !== "POST" || request.url !== "/checkout/update") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = checkoutRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const receipt = await prepareCustomerUpdate(body, generate);
    response.writeHead(200).end(JSON.stringify(receipt));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid checkout request" }));
      return;
    }
    if (error instanceof APIError && error.status >= 400 && error.status < 500) {
      response.writeHead(error.status).end(JSON.stringify({ error: error.message }));
      return;
    }
    console.error(error);
    response.writeHead(502).end(JSON.stringify({ error: "Order update could not be generated" }));
  }
});

server.listen(3000, () => console.log("Checkout update service listening on http://localhost:3000"));
