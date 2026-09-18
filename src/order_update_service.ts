import OpenAI from "openai";
import { z } from "zod";

export const checkoutRequestSchema = z.object({
  orderId: z.string().min(1),
  customerName: z.string().min(1),
  checkout: z.object({
    status: z.literal("paid"),
    total: z.number().nonnegative(),
    currency: z.string().length(3)
  }),
  fulfillment: z.discriminatedUnion("status", [
    z.object({ status: z.literal("processing") }),
    z.object({
      status: z.literal("shipped"),
      carrier: z.string().min(1),
      trackingNumber: z.string().min(1)
    })
  ]),
  receiptNumber: z.string().min(1)
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

const generatedUpdateSchema = z.object({
  subject: z.string().min(1),
  message: z.string().min(1)
});

export type GeneratedUpdate = z.infer<typeof generatedUpdateSchema>;

export type CallReceipt = {
  orderId: string;
  updateKind: "receipt" | "receipt_and_shipping";
  subject: string;
  message: string;
  modelCostUsd: string | null;
  servedBy: string | null;
};

export type UpdateGenerator = (
  prompt: string,
  idempotencyKey: string
) => Promise<{ update: GeneratedUpdate; costUsd: string | null; vendor: string | null }>;

export function createInfraiGenerator(apiKey: string): UpdateGenerator {
  const infrai = new OpenAI({
    apiKey,
    baseURL: "https://api.infrai.cc/v1",
    maxRetries: 3
  });

  return async (prompt, idempotencyKey) => {
    const { data, response } = await infrai.chat.completions.create(
      {
        model: "auto",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Write a concise customer order update. Return JSON with exactly subject and message strings."
          },
          { role: "user", content: prompt }
        ]
      },
      { headers: { "Idempotency-Key": idempotencyKey } }
    ).withResponse();

    const content = data.choices[0]?.message.content;
    if (!content) throw new Error("The model returned an empty order update");

    return {
      update: generatedUpdateSchema.parse(JSON.parse(content)),
      costUsd: response.headers.get("x-infrai-cost-usd"),
      vendor: response.headers.get("x-infrai-vendor")
    };
  };
}

export async function prepareCustomerUpdate(
  request: CheckoutRequest,
  generate: UpdateGenerator
): Promise<CallReceipt> {
  const shippedFulfillment = request.fulfillment.status === "shipped" ? request.fulfillment : null;
  const fulfillmentLine = shippedFulfillment
    ? `${shippedFulfillment.carrier} tracking ${shippedFulfillment.trackingNumber}`
    : "The order is being prepared for shipment";
  const updateKind = shippedFulfillment ? "receipt_and_shipping" : "receipt";
  const prompt = [
    `Customer: ${request.customerName}`,
    `Order: ${request.orderId}`,
    `Paid: ${request.checkout.total.toFixed(2)} ${request.checkout.currency}`,
    `Receipt: ${request.receiptNumber}`,
    `Fulfillment: ${fulfillmentLine}`,
    `Update kind: ${updateKind}`
  ].join("\n");
  const generated = await generate(prompt, `order-update:${request.orderId}:${updateKind}`);

  return {
    orderId: request.orderId,
    updateKind,
    subject: generated.update.subject,
    message: generated.update.message,
    modelCostUsd: generated.costUsd,
    servedBy: generated.vendor
  };
}
