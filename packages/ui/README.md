# @arkbridge/ui

Shared components across Ark products.

Not yet implemented — Phase 9.

Business logic does not live here. A `BridgeCard` renders state and emits intent; it does not
decide whether a route is valid. That decision belongs in `@arkbridge/bridge-core`, where it
can be tested without a DOM.
