# Applications

| App      | Purpose                                                           | Phase |
| -------- | ----------------------------------------------------------------- | ----- |
| `web`    | The bridge frontend. Next.js, wagmi/viem, TanStack Query.         | 9–14  |
| `status` | Public infrastructure status: networks, routes, delivery, agents. | 13    |
| `docs`   | Documentation site.                                               | —     |

`web` is not started until `@arkbridge/sdk` can perform real testnet transfers. Building the
UI against mocked execution produces a UI that looks finished and works on nothing.
