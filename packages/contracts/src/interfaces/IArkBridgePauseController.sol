// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IArkBridgePauseController {
    /// @notice Scope at which a pause was applied. Ordered widest to narrowest.
    enum Scope {
        Global,
        Chain,
        Token,
        Route
    }

    event Paused(Scope indexed scope, bytes32 indexed key, address indexed by, string reason);
    event Unpaused(Scope indexed scope, bytes32 indexed key, address indexed by);

    error TransferPaused(Scope scope, bytes32 key);
    error NotPaused(Scope scope, bytes32 key);
    error AlreadyPaused(Scope scope, bytes32 key);

    function pauseGlobal(string calldata reason) external;
    function pauseChain(uint32 domain, string calldata reason) external;
    function pauseToken(bytes32 tokenId, string calldata reason) external;
    function pauseRoute(bytes32 routeId, string calldata reason) external;

    function isPaused(bytes32 routeId, bytes32 tokenId, uint32 originDomain, uint32 destinationDomain)
        external
        view
        returns (bool);
}
