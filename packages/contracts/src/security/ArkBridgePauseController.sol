// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IArkBridgePauseController} from "../interfaces/IArkBridgePauseController.sol";
import {ArkBridgeRoles} from "./ArkBridgeRoles.sol";

/// @title ArkBridgePauseController
/// @notice Pause authority at four scopes: everything, one chain, one token, or
///         one directed route.
///
/// @dev WHY FOUR SCOPES
///
///      A single global switch is useless in the incident it is meant for. If
///      one asset's oracle is misbehaving, halting every route punishes every
///      user for an unrelated fault and creates pressure to un-pause early. If
///      one chain is reorging, that chain's routes must stop while the others
///      keep working.
///
///      Pausing `ethereum -> ark` must NOT pause `bnb -> ark`, and must not
///      pause `ark -> ethereum`. Routes are directed and independently
///      pausable, so an operator can stop the bleeding without stopping the
///      exit — which matters, because during an incident the direction users
///      most need is usually *out*.
///
///      INV-12: pause cannot be bypassed through another entry point. That
///      holds only if every path consults `assertNotPaused`, so this contract
///      exposes exactly one predicate and every caller uses it. A second code
///      path with its own inlined check is how a pause gets bypassed, so there
///      isn't one.
contract ArkBridgePauseController is ArkBridgeRoles, IArkBridgePauseController {
    bytes32 private constant GLOBAL_KEY = bytes32(0);

    bool private _globalPaused;
    mapping(uint32 domain => bool) private _chainPaused;
    mapping(bytes32 tokenId => bool) private _tokenPaused;
    mapping(bytes32 routeId => bool) private _routePaused;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -- pausing ------------------------------------------------------------

    function pauseGlobal(string calldata reason) external override onlyRole(PAUSER_ROLE) {
        if (_globalPaused) revert AlreadyPaused(Scope.Global, GLOBAL_KEY);
        _globalPaused = true;
        emit Paused(Scope.Global, GLOBAL_KEY, msg.sender, reason);
    }

    function pauseChain(uint32 domain, string calldata reason) external override onlyRole(PAUSER_ROLE) {
        bytes32 key = bytes32(uint256(domain));
        if (_chainPaused[domain]) revert AlreadyPaused(Scope.Chain, key);
        _chainPaused[domain] = true;
        emit Paused(Scope.Chain, key, msg.sender, reason);
    }

    function pauseToken(bytes32 tokenId, string calldata reason) external override onlyRole(PAUSER_ROLE) {
        if (_tokenPaused[tokenId]) revert AlreadyPaused(Scope.Token, tokenId);
        _tokenPaused[tokenId] = true;
        emit Paused(Scope.Token, tokenId, msg.sender, reason);
    }

    function pauseRoute(bytes32 routeId, string calldata reason) external override onlyRole(PAUSER_ROLE) {
        if (_routePaused[routeId]) revert AlreadyPaused(Scope.Route, routeId);
        _routePaused[routeId] = true;
        emit Paused(Scope.Route, routeId, msg.sender, reason);
    }

    // -- unpausing ----------------------------------------------------------
    // Separate role: deciding the danger has passed is not the same authority
    // as deciding to stop.

    function unpauseGlobal() external onlyRole(UNPAUSER_ROLE) {
        if (!_globalPaused) revert NotPaused(Scope.Global, GLOBAL_KEY);
        _globalPaused = false;
        emit Unpaused(Scope.Global, GLOBAL_KEY, msg.sender);
    }

    function unpauseChain(uint32 domain) external onlyRole(UNPAUSER_ROLE) {
        bytes32 key = bytes32(uint256(domain));
        if (!_chainPaused[domain]) revert NotPaused(Scope.Chain, key);
        _chainPaused[domain] = false;
        emit Unpaused(Scope.Chain, key, msg.sender);
    }

    function unpauseToken(bytes32 tokenId) external onlyRole(UNPAUSER_ROLE) {
        if (!_tokenPaused[tokenId]) revert NotPaused(Scope.Token, tokenId);
        _tokenPaused[tokenId] = false;
        emit Unpaused(Scope.Token, tokenId, msg.sender);
    }

    function unpauseRoute(bytes32 routeId) external onlyRole(UNPAUSER_ROLE) {
        if (!_routePaused[routeId]) revert NotPaused(Scope.Route, routeId);
        _routePaused[routeId] = false;
        emit Unpaused(Scope.Route, routeId, msg.sender);
    }

    // -- checks -------------------------------------------------------------

    /// @inheritdoc IArkBridgePauseController
    /// @dev Both domains are checked, so pausing a chain stops transfers to it
    ///      as well as from it. A chain that cannot be trusted as a source
    ///      cannot be trusted as a destination either — sending assets onto a
    ///      chain that is reorging or halted strands them.
    function isPaused(bytes32 routeId, bytes32 tokenId, uint32 originDomain, uint32 destinationDomain)
        public
        view
        override
        returns (bool)
    {
        return _globalPaused || _chainPaused[originDomain] || _chainPaused[destinationDomain] || _tokenPaused[tokenId]
            || _routePaused[routeId];
    }

    /// @notice Revert with the narrowest scope that is actually paused.
    /// @dev The scope is reported so the UI can say "Ethereum -> Ark is
    ///      temporarily unavailable" instead of "something went wrong". A
    ///      deliberate pause is not an error and must never be presented as one.
    function assertNotPaused(bytes32 routeId, bytes32 tokenId, uint32 originDomain, uint32 destinationDomain)
        external
        view
    {
        if (_globalPaused) revert TransferPaused(Scope.Global, GLOBAL_KEY);
        if (_routePaused[routeId]) revert TransferPaused(Scope.Route, routeId);
        if (_tokenPaused[tokenId]) revert TransferPaused(Scope.Token, tokenId);
        if (_chainPaused[originDomain]) revert TransferPaused(Scope.Chain, bytes32(uint256(originDomain)));
        if (_chainPaused[destinationDomain]) {
            revert TransferPaused(Scope.Chain, bytes32(uint256(destinationDomain)));
        }
    }

    function globalPaused() external view returns (bool) {
        return _globalPaused;
    }

    function chainPaused(uint32 domain) external view returns (bool) {
        return _chainPaused[domain];
    }

    function tokenPaused(bytes32 tokenId) external view returns (bool) {
        return _tokenPaused[tokenId];
    }

    function routePaused(bytes32 routeId) external view returns (bool) {
        return _routePaused[routeId];
    }
}
