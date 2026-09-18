import { createInfraiGenerator, prepareCustomerUpdate } from "./order_update_service.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the demo");

const receipt = await prepareCustomerUpdate(
  {
    orderId: "ord_1042",
    customerName: "Mina",
    checkout: { status: "paid", total: 84.5, currency: "USD" },
    fulfillment: { status: "shipped", carrier: "ParcelPost", trackingNumber: "PP2048" },
    receiptNumber: "rcpt_1042"
  },
  createInfraiGenerator(apiKey)
);

console.log(JSON.stringify(receipt, null, 2));
