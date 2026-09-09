// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IInterchainSecurityModule, IMultisigIsm, IRoutingIsm} from "../interfaces/IHyperlane.sol";
import {ArkMessage} from "../libraries/ArkMessage.sol";
import {ArkBridgeGuard} from "../security/ArkBridgeGuard.sol";

/// @title ArkBridgeGuardIsm
/// @notice Inbound gate. Wraps the real security module and adds ArkBridge's
///         pause and rate-limit checks on top of it.
///
/// @dev ORDERING IS THE WHOLE POINT
///
///      The inner ISM runs FIRST. Only a message that Hyperlane's validators
///      have actually attested is allowed to reach the rate limiter.
///
///      Reversing that would be a free denial of service: anyone could submit
///      forged messages that fail verification but have already consumed a
///      route's inbound allowance on the way, throttling honest transfers at no
///      cost to the attacker. Authenticate first, account second.
///
///      This composes rather than replaces. Removing ArkBridge's checks would
///      leave the inner multisig intact; this contract can only ever be more
///      restrictive than the ISM it wraps, never less.
contract ArkBridgeGuardIsm is IInterchainSecurityModule {
    using ArkMessage for bytes;

    ArkBridgeGuard public immutable GUARD;
    IInterchainSecurityModule public immutable INNER_ISM;
    address public immutable MAILBOX;

    mapping(bytes32 sender => mapping(uint32 origin => bytes32 routeId)) private _routeOf;
    mapping(bytes32 routeId => bytes32 tokenId) private _tokenOf;

    event RouteBound(bytes32 indexed sender, uint32 indexed origin, bytes32 indexed routeId, bytes32 tokenId);

    error NotAuthorized(address caller);
    error OnlyMailbox(address caller);
    error InnerIsmRejected();

    constructor(ArkBridgeGuard guard, IInterchainSecurityModule innerIsm, address mailbox) {
        GUARD = guard;
        INNER_ISM = innerIsm;
        MAILBOX = mailbox;
    }

    function bindRoute(bytes32 sender, uint32 origin, bytes32 routeId, bytes32 tokenId) external {
        if (!GUARD.hasRole(GUARD.CONFIG_ADMIN_ROLE(), msg.sender)) revert NotAuthorized(msg.sender);
        _routeOf[sender][origin] = routeId;
        _tokenOf[routeId] = tokenId;
        emit RouteBound(sender, origin, routeId, tokenId);
    }

    /// @inheritdoc IInterchainSecurityModule
    function verify(bytes calldata metadata, bytes calldata message) external override returns (bool) {
        // `verify` mutates (it consumes rate-limit capacity), so it must not be
        // callable by anyone who fancies draining a route's inbound allowance
        // without delivering anything.
        if (msg.sender != MAILBOX) revert OnlyMailbox(msg.sender);

        // Authenticate first. See the ordering note above.
        if (!INNER_ISM.verify(metadata, message)) revert InnerIsmRejected();

        bytes32 routeId = _routeOf[message.sender()][message.origin()];
        if (routeId == bytes32(0)) return true; // not an ArkBridge route

        GUARD.authorizeTransfer(routeId, _tokenOf[routeId], message.origin(), message.tokenAmount());
        return true;
    }

    /// @inheritdoc IInterchainSecurityModule
    /// @dev Delegates to the wrapped module.
    ///
    ///      This is not cosmetic. A relayer reads `moduleType()` to decide what
    ///      metadata to build: reporting NULL here told it "no metadata needed",
    ///      so it submitted an empty payload and the inner multisig then had no
    ///      signatures to verify. Delivery reverted with no useful error, on a
    ///      route whose validators were signing correctly the whole time.
    ///
    ///      A wrapper must be transparent about what it wraps, or it silently
    ///      breaks the very verification it exists to preserve.
    function moduleType() external view override returns (uint8) {
        return INNER_ISM.moduleType();
    }

    /// @notice Forwarded for ROUTING inner modules.
    /// @dev Reporting the inner module's type is not enough on its own. A
    ///      relayer that sees ROUTING then calls `route(message)` to find the
    ///      sub-module that will verify; a wrapper that omits it reverts there
    ///      and delivery stalls with an opaque "execution reverted".
    ///
    ///      The lesson generalises: a transparent wrapper must forward the whole
    ///      interface implied by the type it reports, not just the type tag.
    ///      Both known extensions are forwarded below so this wrapper works over
    ///      a routing module, a multisig, or a routing module containing one.
    function route(bytes calldata message) external view returns (address) {
        return IRoutingIsm(address(INNER_ISM)).route(message);
    }

    /// @notice Forwarded for MULTISIG inner modules.
    function validatorsAndThreshold(bytes calldata message)
        external
        view
        returns (address[] memory validators, uint8 threshold)
    {
        return IMultisigIsm(address(INNER_ISM)).validatorsAndThreshold(message);
    }

    function routeOf(bytes32 sender, uint32 origin) external view returns (bytes32) {
        return _routeOf[sender][origin];
    }

    function tokenOf(bytes32 routeId) external view returns (bytes32) {
        return _tokenOf[routeId];
    }
}
