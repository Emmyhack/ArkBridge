// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal Hyperlane message recipient.
interface IMessageRecipient {
    function handle(uint32 origin, bytes32 sender, bytes calldata message) external payable;
}

/// @title ArkTestRecipient
/// @notice Test-only recipient used to verify a cross-chain path end to end
///         before any token route exists.
/// @dev A recipient that exposes `interchainSecurityModule()` overrides the
///      Mailbox's default ISM for messages addressed to it. That is the whole
///      point here: ArkBridge cannot change Sepolia's default ISM (Abacus Works
///      owns it), but it can require that messages to *its own* contracts be
///      verified by ArkBridge's validator set. Warp routes use the same
///      mechanism in Phase 4.
///
///      Carries `IS_ARKBRIDGE_MOCK` so deployment tooling refuses it in
///      production.
contract ArkTestRecipient is IMessageRecipient {
    bool public constant IS_ARKBRIDGE_MOCK = true;

    address public immutable MAILBOX;

    /// @notice ISM that must verify messages addressed to this contract.
    address public interchainSecurityModule;

    address public owner;

    uint32 public lastOrigin;
    bytes32 public lastSender;
    bytes public lastMessage;
    uint256 public handledCount;

    event Handled(uint32 indexed origin, bytes32 indexed sender, bytes message);

    error NotMailbox(address caller);
    error NotOwner(address caller);

    constructor(address mailbox_, address ism_, address owner_) {
        MAILBOX = mailbox_;
        interchainSecurityModule = ism_;
        owner = owner_;
    }

    /// @dev Only the local Mailbox may deliver. Without this check anyone could
    ///      call `handle` directly and forge a delivery, bypassing the ISM
    ///      entirely — the same mistake would be catastrophic on a warp route.
    function handle(uint32 origin, bytes32 sender, bytes calldata message) external payable override {
        if (msg.sender != MAILBOX) revert NotMailbox(msg.sender);

        lastOrigin = origin;
        lastSender = sender;
        lastMessage = message;
        unchecked {
            handledCount++;
        }

        emit Handled(origin, sender, message);
    }

    function setInterchainSecurityModule(address ism) external {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        interchainSecurityModule = ism;
    }

    function lastMessageString() external view returns (string memory) {
        return string(lastMessage);
    }
}
