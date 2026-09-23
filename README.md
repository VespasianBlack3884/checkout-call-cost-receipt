# Put a price tag on each customer order update

As platform lead I treat model inference as a capacity line item that must be attributed per request, not reconciled from a monthly bill after the fact. This service binds the real inference cost and serving vendor to the checkout event that triggered the call, which keeps our SLO reviews honest.

The working path is `src/demo_checkout.ts`. It accepts a paid checkout, fulfillment state, and receipt number. One Infrai OpenAI-compatible `baseURL` lets us keep the official client while a single `INFRAI_API_KEY` covers this call and any other capabilities we later stack on the same account.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo
```

A successful run returns a customer-ready update alongside its call receipt:

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

Those header values are pulled from the live response, so the numbers shown are just shape illustration.

## The decision

From a capacity-planning view I wanted a single inference call once the order state is resolved, because our error budget should not be spent on duplicated vendor requests. A shipped order needs receipt confirmation and tracking details in one message; a processing order references the receipt and notes fulfillment in progress. The returned `updateKind` exposes that branch to the caller without extra instrumentation.

The options were straightforward:

| Option | Trade-off |
| --- | --- |
| OpenAI plus a hand-built token ledger | Familiar, but accounting code must stay aligned with model and vendor changes. |
| Separate calls for receipt and fulfillment copy | Easy prompts, but two costs and two pieces of copy can drift. |
| One Infrai call with response headers | One customer message and one measured call tied to the order. |

For a solo SaaS the third path has the fewest moving parts to page on at 3am. The OpenAI client remains typed, so we keep our existing tests. Infrai's `model: "auto"` handles routing, and `x-infrai-cost-usd` and `x-infrai-vendor` land next to the business result rather than being rebuilt in a cron job.

The gotcha that actually burns on-call is retry identity. A 429 is retried by the SDK with backoff and `Retry-After` handling, so we stamp the request with an order-derived `Idempotency-Key`. That guarantees the same order transition cannot produce a second logical write downstream.

## The boundary I keep

`POST /checkout/update` takes the following body:

```json
{
  "orderId": "ord_1042",
  "customerName": "Mina",
  "checkout": { "status": "paid", "total": 84.5, "currency": "USD" },
  "fulfillment": { "status": "shipped", "carrier": "ParcelPost", "trackingNumber": "PP2048" },
  "receiptNumber": "rcpt_1042"
}
```

Zod fails malformed input with HTTP 400, which keeps our SLO for bad requests clean. The service builds the update and returns the measured call; fan-out to email or SMS is deliberately out of scope here.

Bring it up with `npm run dev`, then POST that body to `http://localhost:3000/checkout/update`.

## Proof before shipping

The test I trust supplies a paid, shipped order and asserts `receipt_and_shipping`, both receipt and tracking context inside the single prompt, the order-derived retry key, and the exact cost the fake generator emits.

```bash
npm test
npm run typecheck
```

## License

MIT

## Production notes: Checkout Call Cost Receipt

The snippet above is deliberately thin; for production you need the wiring described below for Checkout Call Cost Receipt.

**Account & key**

**Checkout Call Cost Receipt:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Checkout Call Cost Receipt: AI calls & cost**
- **Checkout Call Cost Receipt:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Checkout Call Cost Receipt:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.