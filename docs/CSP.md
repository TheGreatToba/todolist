# Content Security Policy (CSP)

## Current state

The app sets a CSP via Helmet in `server/index.ts`. The **style-src** directive currently includes `'unsafe-inline'` to allow:

- **Runtime inline styles**: Radix UI (and similar libraries) and application code set the `style` attribute on DOM elements for dynamic UI (positioning, animations, layout). Tailwind itself compiles to external CSS; it does not typically inject `style=""` - the need for inline comes from runtime libs or our own `style={{ ... }}`.
- **Inline `<style>` blocks**: If the build or any script injects `<style>` tags, they are currently allowed by `'unsafe-inline'`.

Using `'unsafe-inline'` for styles weakens CSP protection against style-based XSS (e.g. an attacker injecting `<style>` or `style="..."`).

## Important: style-src-elem vs style-src-attr

CSP distinguishes two kinds of style sources (see MDN references below):

- **style-src-elem** (or **style-src** when unspecified): applies to **external stylesheets** (`<link rel="stylesheet">`) and **inline `<style>` elements**. For stylesheets served from same origin, `'self'` is enough; no nonce required on `<link>` for that case.
- **style-src-attr**: applies to the **`style` attribute** on HTML elements (e.g. `<div style="...">`).
  - Nonces and hashes do **not** apply here: they are for **elements** (`<style>`, `<script>`), not for attributes, so we cannot "propagate a nonce" to `style={{ ... }}`.
  - To allow those attributes without `'unsafe-inline'` we must either avoid them (e.g. use classes only) or accept that **removing `'unsafe-inline'` for styles entirely may be unrealistic** as long as Radix or other runtime code sets `style=""` on elements, unless we refactor the UI (e.g. replace inline styles with class-based styling).
  - Styles applied via the CSSOM (e.g. `element.style.prop = value`) are generally not restricted the same way as `setAttribute("style", ...)` or `element.style.cssText`; React and many runtime libs use the CSSOM, so in practice some inline-like styles may still work even under a stricter style-src-attr - but relying on that is implementation-dependent.

## Hardening: what actually works

### For `<style>` and stylesheets (style-src-elem)

- **External stylesheets from same origin**: `style-src 'self'` is sufficient; no nonce on `<link rel="stylesheet">` needed for that.
- **Inline `<style>` blocks**: Use either:
  - **Nonces**: Generate a nonce per request, add it to Helmet's style directive (e.g. `'nonce-<value>'`), and inject the same nonce into every inline `<style>` tag when serving the HTML (e.g. via SSR or a custom index handler). See [Helmet nonce example](https://helmetjs.github.io/faq/csp-nonce-example/).
  - **Hashes**: Compute SHA-256 (or SHA-384/SHA-512) of the **exact** content of each allowed inline `<style>` block and add them to style-src, e.g. `styleSrc: ["'self'", "sha256-..."]`. This applies to **inline `<style>` blocks only**, not to external Tailwind CSS (Tailwind output is in external files). Hashes are practical for a small, fixed set of inline blocks; they become cumbersome if content changes often or is generated at runtime.

### For the `style` attribute (style-src-attr)

- No nonce/hash mechanism; the trade-off (keep `'unsafe-inline'` vs refactor to classes/CSS variables) is described in the style-src-attr bullets above.

## Recommendation

- **Short term**: Keep the current CSP; the in-code comment and this doc make the trade-off explicit.
- **Before hardening**: Use **Content-Security-Policy-Report-Only** and a **report URI** so violations are collected somewhere the team can inspect. Define where reports go before enabling: e.g. an app endpoint (e.g. `POST /api/csp-report` that logs or forwards to your monitoring), a third-party service (e.g. report-uri.com), or your logging/monitoring backend. Then remove or tighten directives based on what actually breaks, not guesswork.
- **Medium term**: If we have no inline `<style>` tags, we can rely on `'self'` for stylesheets only. If we do have inline `<style>`, consider nonces (with a nonce-aware pipeline) or hashes for those blocks.
- **Reality check**: As long as Radix or other runtime code sets the `style` attribute, fully removing `'unsafe-inline'` for styles may require a UI refactor (e.g. moving dynamic styles into classes or nonce-bearing `<style>` blocks).

### Report-Only: operational details (app endpoint)

If you use an in-app endpoint (e.g. `POST /api/csp-report`) to collect violations, close the loop with:

- **Payload**: Browsers send `POST` with `Content-Type: application/csp-report`; the body is JSON with a `csp-report` object (e.g. `blocked-uri`, `violated-directive`, `document-uri`, `source-file`, `line-number`). See [MDN CSP report payload](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP#violation_report_syntax). Parse and log or forward this structure.
- **Retention**: Decide how long to keep reports (e.g. 30-90 days for tuning, then shorten or sample). Store in logs, a small table, or forward to your logging/monitoring backend; avoid retaining raw reports indefinitely without a purpose.
- **Alerting**: Define when to act: e.g. alert on a spike in violations, on repeated violations for a given directive or URI, or on `blocked-uri` values that look like injected content. Wire into your existing alerting (dashboard, Slack, PagerDuty, etc.) so the team can react before tightening the policy.

## References

- [MDN: CSP style-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/style-src)
- [MDN: CSP style-src-attr](https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr)
- [MDN: Introducing CSP (nonces)](https://developer.mozilla.org/en-US/docs/Web/Security/CSP/Introducing_Content_Security_Policy)
- [Helmet CSP](https://helmetjs.github.io/#content-security-policy)
- [Helmet nonce example](https://helmetjs.github.io/faq/csp-nonce-example/)
