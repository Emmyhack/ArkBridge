// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IInterchainSecurityModule, IMultisigIsm, IRoutingIsm} from "../interfaces/IHyperlane.sol";

/// @title ArkBridgeRecoveryIsm
/// @notice Delivers specific, individually named messages that can never be
///         proved through normal verification — while leaving every other
///         message fully verified by the real ISM.
///
/// @dev WHY THIS EXISTS
///
///      A message that was dispatched but never inserted into its origin's
///      merkle tree is permanently unprovable: no validator can sign a
///      checkpoint covering it, so no multisig proof will ever exist. The
///      collateral stays locked and the synthetic is never minted. That is not
///      hypothetical — a misconfigured dispatch hook on this devnet stranded two
///      transfers exactly this way.
///
///      WHY NOT JUST USE A TRUSTED RELAYER ISM
///
///      The obvious recovery is to point the router at a trustedRelayerIsm for
///      a moment. That works, and it is dangerous: for the whole window, ANY
///      message from that one key is accepted on a live route. The blast radius
///      is every asset on that router, not the two being recovered.
///
///      This contract narrows that to exactly the messages an operator has
///      named in advance:
///
///        - The allowlist holds message IDs, added one at a time, on-chain,
///          publicly auditable before anything is delivered.
///        - Every message NOT on the list is passed to the inner ISM unchanged,
///          so normal traffic keeps its full multisig verification the entire
///          time this is installed.
///        - Each entry is single-use: consumed on delivery, so a replay finds an
///          empty slot and falls through to real verification (INV-06).
///
///      It is still a privileged override and still must be removed afterwards.
///      It is simply the smallest one that does the job.
contract ArkBridgeRecoveryIsm is IInterchainSecurityModule {
    IInterchainSecurityModule public immutable INNER_ISM;
    address public immutable OWNER;

    /// @notice Message IDs cleared for recovery. Single-use.
    mapping(bytes32 messageId => bool) public recoverable;

    uint256 public recoveredCount;

    event RecoveryAllowed(bytes32 indexed messageId, address indexed by);
    event RecoveryRevoked(bytes32 indexed messageId, address indexed by);
    event Recovered(bytes32 indexed messageId);

    error NotOwner(address caller);

    constructor(IInterchainSecurityModule innerIsm, address owner) {
        INNER_ISM = innerIsm;
        OWNER = owner;
    }

    modifier onlyOwner() {
        if (msg.sender != OWNER) revert NotOwner(msg.sender);
        _;
    }

    /// @notice Clear one message for recovery. Emits, so the decision is
    ///         visible on-chain before any delivery happens.
    function allow(bytes32 messageId) external onlyOwner {
        recoverable[messageId] = true;
        emit RecoveryAllowed(messageId, msg.sender);
    }

    function revoke(bytes32 messageId) external onlyOwner {
        recoverable[messageId] = false;
        emit RecoveryRevoked(messageId, msg.sender);
    }

    /// @inheritdoc IInterchainSecurityModule
    /// @dev A Hyperlane message id is `keccak256(message)`, so the allowlist
    ///      binds to the exact bytes — not to a sender, a route, or an amount
    ///      that could be varied afterwards.
    function verify(bytes calldata metadata, bytes calldata message) external override returns (bool) {
        bytes32 id = keccak256(message);

        if (recoverable[id]) {
            // Consume before returning: single-use, so this cannot become a
            // standing bypass for the same message.
            recoverable[id] = false;
            unchecked {
                recoveredCount++;
            }
            emit Recovered(id);
            return true;
        }

        return INNER_ISM.verify(metadata, message);
    }

    // -- transparent forwarding ---------------------------------------------
    // A relayer keys its metadata construction off these. Reporting anything
    // other than the inner module's own answers silently breaks verification
    // for every message that is NOT being recovered.

    function moduleType() external view override returns (uint8) {
        return INNER_ISM.moduleType();
    }

    function route(bytes calldata message) external view returns (address) {
        return IRoutingIsm(address(INNER_ISM)).route(message);
    }

    function validatorsAndThreshold(bytes calldata message)
        external
        view
        returns (address[] memory validators, uint8 threshold)
    {
        return IMultisigIsm(address(INNER_ISM)).validatorsAndThreshold(message);
    }
}
