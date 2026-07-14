# Frontend mental model for a backend engineer

Frontend architecture is distributed-systems architecture on a hostile, stateful client with a visual output. The browser is not a trusted application server. It has partial data, user-controlled execution, unreliable networks, multiple tabs, back/forward navigation, device constraints, and asynchronous events that can arrive out of order.

## 1. The browser/server boundary

Treat the browser like an untrusted external client:

- Browser validation improves feedback; server validation protects the system.
- Hiding a button is presentation; checking authorization at a trusted boundary is security.
- TypeScript types disappear at runtime. Validate requests, environment variables, database results from weakly typed sources, and third-party responses.
- Anything delivered to browser JavaScript can be read or changed by the user. Public configuration may be present there; secrets may not.

In a framework such as Next.js, a component may execute on the server, in the browser, or participate in both phases through rendered output plus hydration. Before changing a component, ask: where does this code execute, what data crosses the boundary, and what is shipped to the browser?

## 2. Rendering is a placement decision

Rendering modes are comparable to deciding where computation happens:

- **Static generation:** compute at build time and serve an artifact. Fast and cacheable; stale until rebuilt or revalidated.
- **Server rendering:** compute HTML for a request. Keeps secrets/server data off the client but adds request-time work and failure modes.
- **Client rendering:** ship JavaScript and fetch/compute in the browser. Rich interaction, but more loading states, larger bundles, and weaker first-render behavior.
- **Incremental or cached rendering:** reuse prior server/build work with an invalidation policy. Treat invalidation as a correctness problem, not only a performance feature.

Do not select one mode for the entire application. Choose per route and data dependency, then make cache ownership and freshness explicit.

## 3. State has different authorities

Most frontend state bugs come from storing the same fact in several places. Classify state before choosing a library:

| State kind | Authority | Examples | Typical home |
| --- | --- | --- | --- |
| Server state | Backend/database | Account, saved scenario | Server fetch/cache layer |
| URL state | Address bar/history | Search, filters, selected tab | Route/search parameters |
| Form state | Current user edit | Draft inputs, validation errors | Form/controller |
| Local UI state | One interaction surface | Dialog open, menu expanded | Component state |
| Derived state | Other state | Total, filtered list, validity | Compute; usually do not store |

An excellent default is: keep one source of truth, derive what is cheap, and make synchronization exceptional. Global state libraries do not solve ambiguous ownership.

## 4. React is synchronization, not page templating

A React component describes UI for current inputs and state. Effects synchronize React with systems outside React: browser APIs, subscriptions, timers, analytics, or imperative widgets. An effect that only copies one piece of React state into another is often a design smell.

Useful review questions:

- Can this value be calculated during render?
- Is state colocated with the smallest subtree that needs it?
- Does an asynchronous response overwrite newer user intent?
- What cancels work when the component disappears or inputs change?
- Are stable identifiers used, or is array position pretending to be identity?

## 5. CSS is a constraint system

CSS is closer to a layout solver than imperative drawing. Parent and child constraints, intrinsic content size, font metrics, and viewport size interact.

- Build from normal document flow; add absolute positioning only for true overlays.
- Prefer flexible grids, wrapping, and min/max constraints over pixel-perfect fixed dimensions.
- Test long labels, empty content, validation messages, zoom, narrow screens, and large text.
- Establish a small spacing, typography, color, and radius vocabulary before accumulating magic values.
- Responsive design is not "desktop plus one mobile breakpoint"; it is continuous behavior under changing constraints.

## 6. Accessibility is interface correctness

Semantic HTML is analogous to a well-designed protocol: native elements expose behavior and meaning to keyboards, assistive technology, automation, and browsers.

- Start with the correct native element (`button`, `a`, `label`, headings, lists, tables).
- Every interaction must work without a mouse and show visible focus.
- Inputs need programmatic labels and errors associated with the relevant field.
- Color cannot be the only carrier of meaning.
- Automated tools catch only part of the problem; perform keyboard and screen-reader-oriented inspection on critical flows.

Accessibility usually improves testability and reduces custom interaction code.

## 7. Every request is a state machine

"Show a spinner and then data" is incomplete. Model at least:

- idle or not requested;
- loading;
- success with data;
- success with no data;
- validation failure;
- authentication or authorization failure;
- retryable dependency/network failure;
- unexpected failure;
- stale data while refreshing, when applicable.

Decide what happens after a retry, navigation, duplicate submission, slow response, or partial mutation. Disablement alone is not idempotency.

## 8. Testing layers

- **Domain unit tests:** pure calculations and rules; fastest and most exhaustive.
- **Component tests:** rendering and interaction behavior with controlled dependencies.
- **Integration tests:** server handlers, database rules, and boundary validation.
- **Browser end-to-end tests:** a small number of critical workflows through the deployed shape.
- **Visual and accessibility checks:** layout, responsive behavior, keyboard flow, and regressions source inspection cannot prove.

The browser test is not a substitute for domain tests, and a component snapshot is not proof of usability.

## Frontend review checklist

1. Where does each piece execute: build, server request, or browser?
2. Who owns each state value, and is it duplicated?
3. What are the loading, empty, error, denied, and retry behaviors?
4. Does it work with keyboard, zoom, long content, and narrow screens?
5. Are secrets, authorization, validation, and sensitive logs kept at trusted boundaries?
6. What automated test protects the logic, and what browser evidence protects the experience?

## Further reading

- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [MDN: Semantic HTML](https://developer.mozilla.org/en-US/docs/Glossary/Semantics#semantics_in_html)
- [W3C Web Accessibility Initiative](https://www.w3.org/WAI/fundamentals/accessibility-intro/)
