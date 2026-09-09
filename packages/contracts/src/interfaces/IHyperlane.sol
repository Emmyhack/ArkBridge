// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal declarations of the Hyperlane interfaces ArkBridge plugs into.
/// @dev Declared here rather than imported because `@hyperlane-xyz/core` ships
///      only compiled artifacts to npm — there is no Solidity to import. These
///      are the stable, externally-facing interfaces the Mailbox calls; they are
///      not a fork of any implementation, and ArkBridge implements them rather
///      than modifying upstream code.
///
///      Verified against the deployed Ark Mailbox (PACKAGE_VERSION 12.1.0,
///      message VERSION 3).
interface IInterchainSecurityModule {
    /// @notice Verify a message. Reverting or returning false rejects delivery.
    /// @dev Deliberately non-view: an ISM is permitted to record state, which is
    ///      how inbound rate limiting is possible at all. Hyperlane's own
    ///      rate-limited ISM relies on the same property.
    function verify(bytes calldata metadata, bytes calldata message) external returns (bool);

    function moduleType() external view returns (uint8);
}

/// @notice The extra surface a ROUTING module exposes, used by relayers to
///         resolve which sub-module will actually verify a given message.
interface IRoutingIsm {
    function route(bytes calldata message) external view returns (address);
}

/// @notice The extra surface a MULTISIG module exposes.
interface IMultisigIsm {
    function validatorsAndThreshold(bytes calldata message)
        external
        view
        returns (address[] memory validators, uint8 threshold);
}

interface IPostDispatchHook {
    /// @notice Called by the Mailbox after a message is dispatched.
    /// @dev Reverting here reverts the dispatch, which is what makes a hook a
    ///      usable outbound gate.
    function postDispatch(bytes calldata metadata, bytes calldata message) external payable;

    function quoteDispatch(bytes calldata metadata, bytes calldata message) external view returns (uint256);

    function hookType() external view returns (uint8);

    function supportsMetadata(bytes calldata metadata) external view returns (bool);
}
