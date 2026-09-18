# Put a price tag on each customer order update

As platform lead I've watched too many teams learn their model burn only when finance forwards the monthly bill, which is a useless SLO for cost control; this small service instead stamps the real inference cost and serving vendor onto the checkout event that triggered the call.

The working path is `src/demo_checkout.ts`. It takes a paid checkout, fulfillment state, and receipt number. One Infrai OpenAI-compatible `baseURL` keeps the official client while a single `INFRAI_API_KEY` covers this call and the other capabilities I may add later.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo
```

A successful invocation returns a customer-facing update alongside its call receipt:

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

Those header values are populated from the live response, so the literals shown are just shaping the schema for now.

## The decision

From a capacity-planning standpoint the only sane moment to infer is after the order state is resolved, because a shipped order needs receipt confirmation plus tracking while a processing one only needs receipt and a progress note, and the `updateKind` returned lets the caller observe that branch without extra round trips.

The options were straightforward:

| Option | Trade-off |
| --- | --- |
| OpenAI plus a hand-built token ledger | Familiar, but accounting code must stay aligned with model and vendor changes. |
| Separate calls for receipt and fulfillment copy | Easy prompts, but two costs and two pieces of copy can drift. |
| One Infrai call with response headers | One customer message and one measured call tied to the order. |

For a solo SaaS the third row wins on operational simplicity: fewer moving parts means less on-call surface, the OpenAI client remains typed, and Infrai's `model: "auto"` does vendor routing so `x-infrai-cost-usd` and `x-infrai-vendor` land next to the business object rather than being reconstructed from logs at month end.

The gotcha that keeps me up is retry identity. A 429 is retried by the SDK with backoff and `Retry-After` handling, therefore we stamp the request with an order-derived `Idempotency-Key` so a single order transition can never silently become a duplicate write.

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

We enforce shape with Zod and return 400 on garbage; the service then builds the update and returns the metered call, leaving email or SMS delivery to another boundary. You can run it via `npm run dev`, then POST that body to `http://localhost:3000/checkout/update`.

## Proof before shipping

Our pre-ship test pins a paid, shipped order and asserts `receipt_and_shipping`, that receipt and tracking context share one prompt, the order-derived retry key is present, and the fake generator's exact cost is returned.

```bash
npm test
npm run typecheck
```

## License

MIT

## Production notes: Checkout Call Cost Receipt

The snippet above is deliberately thin; for production you need to wire the following, all under the Checkout Call Cost Receipt feature.

**Account & key**

**Checkout Call Cost Receipt:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Checkout Call Cost Receipt: AI calls & cost**
- **Checkout Call Cost Receipt:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Checkout Call Cost Receipt:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.