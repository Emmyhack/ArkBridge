export { ArkBridge } from "./client.js";
export * from "./types.js";
export * from "./abi.js";

// Re-exported so consumers get one import for the whole surface: presentation,
// validation and error normalisation belong with the client that produces them.
export {
  presentStatus,
  presentFailure,
  presentBridgeFailure,
  normalizeError,
  stageIndex,
  TRANSFER_STAGES,
  parseAmount,
  formatAmount,
  convertDecimals,
  flipSelection,
  selectableSourceChains,
  selectableDestinationChains,
  selectableTokens,
  usableRoutes,
  resolveRoute,
  routeIdOf,
  validateAmount,
  assertCorrectNetwork,
} from "@arkbridge/bridge-core";
export type {
  RouteCatalog,
  RouteSelection,
  StatusPresentation,
  FailurePresentation,
} from "@arkbridge/bridge-core";
