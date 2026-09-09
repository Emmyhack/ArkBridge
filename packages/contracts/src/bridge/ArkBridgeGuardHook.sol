// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPostDispatchHook} from "../interfaces/IHyperlane.sol";
import {ArkMessage} from "../libraries/ArkMessage.sol";
import {ArkBridgeGuard} from "../security/ArkBridgeGuard.sol";

/// @title ArkBridgeGuardHook
/// @notice Outbound gate. The Mailbox calls this on every dispatch from a
///         warp router, and a revert here reverts the transfer.
///
/// @dev This is why ArkBridge does not need to fork Hyperlane's routers. A
///      post-dispatch hook is an official extension point that already receives
///      the full message, so pause and rate-limit enforcement can be attached
///      to routers that are already deployed — no redeploy, no modified
///      upstream code.
///
///      Only messages from routers ArkBridge has registered are gated. Anything
///      else passes through untouched: this hook may be shared with unrelated
///      traffic on the same Mailbox, and silently reverting other people's
///      messages would be both wrong and a denial of service.
contract ArkBridgeGuardHook is IPostDispatchHook {
    using ArkMessage for bytes;

    ArkBridgeGuard public immutable GUARD;

    /// @notice The hook this one wraps — normally the Mailbox's merkleTreeHook.
    /// @dev A router has exactly ONE hook slot. Setting this contract without
    ///      forwarding would REMOVE the merkle tree insertion that every
    ///      multisig ISM verifies against: dispatches would still succeed, the
    ///      tree would stop growing, validators would have nothing new to sign,
    ///      and every message would hang unverifiable with no error anywhere.
    ///
    ///      That is not a hypothetical — it is what happened on the first
    ///      deployment of this contract. A wrapper composes or it breaks the
    ///      thing it wrapped.
    IPostDispatchHook public immutable INNER_HOOK;

    /// @dev Reported when the wrapped hook predates `hookType()`.
    uint8 private constant HOOK_TYPE_UNUSED = 0;

    /// @notice Maps a dispatching router to the route it represents.
    /// @dev Keyed by (sender, destination) because one router serves one remote
    ///      per directed route. Registered through the guard's config role, so
    ///      route identity is not something a caller can assert for itself.
    mapping(bytes32 sender => mapping(uint32 destination => bytes32 routeId)) private _routeOf;
    mapping(bytes32 routeId => bytes32 tokenId) private _tokenOf;

    event RouteBound(bytes32 indexed sender, uint32 indexed destination, bytes32 indexed routeId, bytes32 tokenId);

    error NotAuthorized(address caller);

    constructor(ArkBridgeGuard guard, IPostDispatchHook innerHook) {
        GUARD = guard;
        INNER_HOOK = innerHook;
    }

    /// @notice Bind a dispatching router to a route so its transfers are gated.
    function bindRoute(bytes32 sender, uint32 destination, bytes32 routeId, bytes32 tokenId) external {
        if (!GUARD.hasRole(GUARD.CONFIG_ADMIN_ROLE(), msg.sender)) revert NotAuthorized(msg.sender);
        _routeOf[sender][destination] = routeId;
        _tokenOf[routeId] = tokenId;
        emit RouteBound(sender, destination, routeId, tokenId);
    }

    /// @inheritdoc IPostDispatchHook
    function postDispatch(bytes calldata metadata, bytes calldata message) external payable override {
        bytes32 routeId = _routeOf[message.sender()][message.destination()];

        // An ArkBridge route is gated; anything else passes straight through.
        // This hook may share a Mailbox with unrelated traffic, and reverting
        // other people's messages would be both wrong and a denial of service.
        if (routeId != bytes32(0)) {
            GUARD.authorizeTransfer(routeId, _tokenOf[routeId], message.origin(), message.tokenAmount());
        }

        // ALWAYS forward, gated or not. See INNER_HOOK.
        INNER_HOOK.postDispatch{value: msg.value}(metadata, message);
    }

    /// @inheritdoc IPostDispatchHook
    /// @dev Gating itself costs the sender nothing, but the wrapped hook may
    ///      charge, so its quote is forwarded unchanged. ArkBridge's own fee,
    ///      when it exists, is charged explicitly and shown to the user rather
    ///      than smuggled into a hook quote (spec §33).
    function quoteDispatch(bytes calldata metadata, bytes calldata message) external view override returns (uint256) {
        return INNER_HOOK.quoteDispatch(metadata, message);
    }

    /// @dev Delegated, like the ISM wrapper's moduleType: callers key behaviour
    ///      off this, and reporting our own type would misdescribe what runs.
    ///
    ///      Guarded, because ArkBridge spans chains whose Hyperlane deployments
    ///      are different vintages. Sepolia's merkleTreeHook predates
    ///      `hookType()` and reverts on it, while Ark's (12.1.0) answers 3. An
    ///      unguarded delegation makes the wrapper unusable on the older chain
    ///      for a purely informational call.
    function hookType() external view override returns (uint8) {
        try INNER_HOOK.hookType() returns (uint8 inner) {
            return inner;
        } catch {
            return HOOK_TYPE_UNUSED;
        }
    }

    /// @dev Same reasoning. A hook that cannot answer is treated as accepting
    ///      any metadata, which is what an older hook does in practice.
    function supportsMetadata(bytes calldata metadata) external view override returns (bool) {
        try INNER_HOOK.supportsMetadata(metadata) returns (bool supported) {
            return supported;
        } catch {
            return true;
        }
    }

    function routeOf(bytes32 sender, uint32 destination) external view returns (bytes32) {
        return _routeOf[sender][destination];
    }

    function tokenOf(bytes32 routeId) external view returns (bytes32) {
        return _tokenOf[routeId];
    }
}
