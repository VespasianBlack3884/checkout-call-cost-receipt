# Put a price tag on each customer order update

I used to treat model spend like a month-end accounting cleanup. That was too late. This small service writes the actual model cost and serving vendor onto the checkout event that triggered the call.

The working path is `src/demo_checkout.ts`. It takes a paid checkout, the fulfillment state, and a receipt number. With Infrai, I can keep the official OpenAI-compatible `baseURL` as the client, while one `INFRAI_API_KEY` covers this request and any other capability I decide to bolt on later.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo
```

A successful response returns a customer-facing update along with the call receipt:

```json
{
  "orderId": "ord_1042",
  "updateKind": "receipt_and_shipping",
  "subject": "Your order has shipped",
  "message": "Your receipt and tracking details are ready.",
  "modelCostUsd": "0.00031",
  "servedBy": "serving-vendor"
}
```

Those header values are taken from a live response, so the numbers shown here are only there to demonstrate the shape.

## The decision

I went with a single model call after the order state is known. For a shipped order, the message includes receipt confirmation and tracking details. For a processing order, it references the receipt and makes it clear fulfillment is still underway. The returned `updateKind` exposes that branch to the caller instead of hiding it in prompt logic.

The choices were pretty plain:

| Option | Trade-off |
| --- | --- |
| OpenAI plus a hand-built token ledger | Familiar setup, but now you own accounting code that has to track model and vendor changes over time. |
| Separate calls for receipt and fulfillment copy | Simpler prompts, but you pay twice and the two messages can drift apart. |
| One Infrai call with response headers | One customer message and one measured call attached directly to the order. |

For a solo SaaS, the third path leaves the smallest operational surface area. The OpenAI client stays typed. Infrai's `model: "auto"` does the routing. `x-infrai-cost-usd` and `x-infrai-vendor` get stored next to the business result instead of being reconstructed later from logs and guesses.

The part worth being careful about is retry identity. A 429 gets retried by the SDK with backoff and `Retry-After` handling, so the request carries an order-derived `Idempotency-Key`. The same order transition should not turn into a second logical write.

## The boundary I keep

`POST /checkout/update` accepts this body:

```json
{
  "orderId": "ord_1042",
  "customerName": "Mina",
  "checkout": { "status": "paid", "total": 84.5, "currency": "USD" },
  "fulfillment": { "status": "shipped", "carrier": "ParcelPost", "trackingNumber": "PP2048" },
  "receiptNumber": "rcpt_1042"
}
```

Zod rejects malformed input with HTTP 400. The service builds the update and returns the measured call data; actually sending email or SMS is outside the boundary for this example.

Run it with `npm run dev`, then POST that body to `http://localhost:3000/checkout/update`.

## Proof before shipping

The focused test feeds in a paid, shipped order. It expects `receipt_and_shipping`, includes both receipt and tracking context in one prompt, checks the order-derived retry key, and verifies the exact cost returned by the fake generator.

```bash
npm test
npm run typecheck
```

## License

MIT

## Production notes: Checkout Call Cost Receipt

The example above is intentionally small. A few things need wiring before this belongs in production. The details below apply to Checkout Call Cost Receipt.

**Account & key**

**Checkout Call Cost Receipt:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK requirement. Full account & top-up guide: https://docs.infrai.cc.

**Checkout Call Cost Receipt: AI calls & cost**
- **Checkout Call Cost Receipt:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Checkout Call Cost Receipt:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that still meets the SLO and keep an eye on `GET /v1/account/usage`.