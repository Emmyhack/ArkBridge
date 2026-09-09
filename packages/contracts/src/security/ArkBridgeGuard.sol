// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ArkBridgePauseController} from "./ArkBridgePauseController.sol";
import {ArkBridgeRateLimiter} from "./ArkBridgeRateLimiter.sol";
import {ArkBridgeRoles} from "./ArkBridgeRoles.sol";

/// @title ArkBridgeGuard
/// @notice The single gate every ArkBridge transfer passes through.
///
/// @dev This exists to make INV-01, INV-02, INV-12 and INV-15 structural rather
///      than aspirational. Those invariants say unsupported assets and routes
///      cannot bridge, pause cannot be bypassed via another entry point, and a
///      wrong origin domain cannot authorise anything.
///
///      None of that survives having two code paths. So there is one
///      (`authorizeTransfer`), it is the only non-view function that consumes
///      limit capacity, and every check runs in it. A caller cannot reach the
///      rate limiter or the pause controller "the other way" because the guard
///      holds the only role that lets anyone consume.
///
///      Ordering inside is deliberate: registration, then pause, then limits.
///      Limits are consumed last because consumption mutates state — checking
///      capacity before confirming the transfer is even permitted would burn
///      allowance on transfers that were always going to revert, which is a
///      free denial-of-service against a route.
contract ArkBridgeGuard is ArkBridgeRoles {
    struct Route {
        bool registered;
        uint32 originDomain;
        uint32 destinationDomain;
        bytes32 tokenId;
    }

    ArkBridgeRateLimiter public immutable RATE_LIMITER;
    ArkBridgePauseController public immutable PAUSE_CONTROLLER;

    mapping(bytes32 routeId => Route) private _routes;
    mapping(bytes32 tokenId => bool) private _tokens;
    /// @notice Contracts permitted to call `authorizeTransfer` (the warp routers).
    mapping(address caller => bool) private _authorizedCallers;

    event RouteRegistered(bytes32 indexed routeId, uint32 originDomain, uint32 destinationDomain, bytes32 tokenId);
    event RouteDeregistered(bytes32 indexed routeId);
    event TokenRegistered(bytes32 indexed tokenId);
    event TokenDeregistered(bytes32 indexed tokenId);
    event CallerAuthorized(address indexed caller, bool authorized);
    event TransferAuthorized(bytes32 indexed routeId, bytes32 indexed tokenId, uint256 amount);

    error UnsupportedRoute(bytes32 routeId);
    error UnsupportedToken(bytes32 tokenId);
    error UnauthorizedCaller(address caller);
    error OriginDomainMismatch(bytes32 routeId, uint32 expected, uint32 actual);
    error RouteTokenMismatch(bytes32 routeId, bytes32 expected, bytes32 actual);
    error RouteAlreadyRegistered(bytes32 routeId);

    constructor(address admin, ArkBridgeRateLimiter rateLimiter, ArkBridgePauseController pauseController) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        RATE_LIMITER = rateLimiter;
        PAUSE_CONTROLLER = pauseController;
    }

    // -- configuration ------------------------------------------------------

    function registerToken(bytes32 tokenId) external onlyRole(CONFIG_ADMIN_ROLE) {
        _tokens[tokenId] = true;
        emit TokenRegistered(tokenId);
    }

    function deregisterToken(bytes32 tokenId) external onlyRole(CONFIG_ADMIN_ROLE) {
        _tokens[tokenId] = false;
        emit TokenDeregistered(tokenId);
    }

    /// @dev Registration is not idempotent on purpose. Silently overwriting a
    ///      live route's token or domains is how a canonical mapping gets
    ///      replaced without anyone noticing (INV-14). Deregister first, which
    ///      is a separate, visible act.
    function registerRoute(bytes32 routeId, uint32 originDomain, uint32 destinationDomain, bytes32 tokenId)
        external
        onlyRole(CONFIG_ADMIN_ROLE)
    {
        if (_routes[routeId].registered) revert RouteAlreadyRegistered(routeId);
        _routes[routeId] = Route(true, originDomain, destinationDomain, tokenId);
        emit RouteRegistered(routeId, originDomain, destinationDomain, tokenId);
    }

    function deregisterRoute(bytes32 routeId) external onlyRole(CONFIG_ADMIN_ROLE) {
        delete _routes[routeId];
        emit RouteDeregistered(routeId);
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyRole(CONFIG_ADMIN_ROLE) {
        _authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    // -- the gate -----------------------------------------------------------

    /// @notice Authorise one transfer, consuming its rate-limit capacity.
    /// @param routeId          Directed route being used.
    /// @param tokenId          Asset being moved.
    /// @param claimedOrigin    Origin domain as claimed by the caller.
    /// @param amount           Amount in the source token's base units.
    ///
    /// @dev `claimedOrigin` is checked against the route's registered origin
    ///      rather than trusted. This is INV-15: a message asserting the wrong
    ///      origin must not authorise a mint or a release. The caller supplies
    ///      what it read from the message; the guard decides whether that
    ///      matches the route it claims to be using.
    function authorizeTransfer(bytes32 routeId, bytes32 tokenId, uint32 claimedOrigin, uint256 amount) external {
        if (!_authorizedCallers[msg.sender]) revert UnauthorizedCaller(msg.sender);

        Route memory route = _routes[routeId];
        if (!route.registered) revert UnsupportedRoute(routeId);
        if (!_tokens[tokenId]) revert UnsupportedToken(tokenId);
        if (route.tokenId != tokenId) revert RouteTokenMismatch(routeId, route.tokenId, tokenId);
        if (route.originDomain != claimedOrigin) {
            revert OriginDomainMismatch(routeId, route.originDomain, claimedOrigin);
        }

        PAUSE_CONTROLLER.assertNotPaused(routeId, tokenId, route.originDomain, route.destinationDomain);

        // Last, because it mutates. See the ordering note on the contract.
        RATE_LIMITER.consume(routeId, amount);

        emit TransferAuthorized(routeId, tokenId, amount);
    }

    // -- views --------------------------------------------------------------

    /// @notice What the UI should show as remaining capacity, or 0 if the route
    ///         cannot currently be used at all.
    function availableCapacity(bytes32 routeId) external view returns (uint256) {
        Route memory route = _routes[routeId];
        if (!route.registered || !_tokens[route.tokenId]) return 0;
        if (PAUSE_CONTROLLER.isPaused(routeId, route.tokenId, route.originDomain, route.destinationDomain)) {
            return 0;
        }
        return RATE_LIMITER.available(routeId);
    }

    function routeOf(bytes32 routeId) external view returns (Route memory) {
        return _routes[routeId];
    }

    function isTokenRegistered(bytes32 tokenId) external view returns (bool) {
        return _tokens[tokenId];
    }

    function isAuthorizedCaller(address caller) external view returns (bool) {
        return _authorizedCallers[caller];
    }
}
