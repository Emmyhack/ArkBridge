// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ArkMessage
/// @notice Reads the fields ArkBridge needs out of a Hyperlane message.
///
/// @dev Hyperlane message layout (version 3), all big-endian, packed:
///
///        offset  size  field
///        0       1     version
///        1       4     nonce
///        5       4     origin
///        9       32    sender
///        41      4     destination
///        45      32    recipient
///        77      ...   body
///
///      A warp-route body is a TokenMessage: 32 bytes recipient, 32 bytes
///      amount, then optional metadata.
///
///      Every accessor bounds-checks before reading. A malformed or truncated
///      message must revert rather than read adjacent calldata as an amount —
///      an under-length body silently decoding to a huge number is exactly the
///      kind of thing a hostile sender would try.
library ArkMessage {
    uint256 private constant VERSION_OFFSET = 0;
    uint256 private constant NONCE_OFFSET = 1;
    uint256 private constant ORIGIN_OFFSET = 5;
    uint256 private constant SENDER_OFFSET = 9;
    uint256 private constant DESTINATION_OFFSET = 41;
    uint256 private constant RECIPIENT_OFFSET = 45;
    uint256 private constant BODY_OFFSET = 77;

    uint256 private constant TOKEN_RECIPIENT_SIZE = 32;
    uint256 private constant TOKEN_AMOUNT_END = 64;

    error MessageTooShort(uint256 length, uint256 required);

    function version(bytes calldata message) internal pure returns (uint8) {
        _require(message, BODY_OFFSET);
        return uint8(message[VERSION_OFFSET]);
    }

    function nonce(bytes calldata message) internal pure returns (uint32) {
        _require(message, BODY_OFFSET);
        return uint32(bytes4(message[NONCE_OFFSET:NONCE_OFFSET + 4]));
    }

    function origin(bytes calldata message) internal pure returns (uint32) {
        _require(message, BODY_OFFSET);
        return uint32(bytes4(message[ORIGIN_OFFSET:ORIGIN_OFFSET + 4]));
    }

    function sender(bytes calldata message) internal pure returns (bytes32) {
        _require(message, BODY_OFFSET);
        return bytes32(message[SENDER_OFFSET:SENDER_OFFSET + 32]);
    }

    function destination(bytes calldata message) internal pure returns (uint32) {
        _require(message, BODY_OFFSET);
        return uint32(bytes4(message[DESTINATION_OFFSET:DESTINATION_OFFSET + 4]));
    }

    function recipient(bytes calldata message) internal pure returns (bytes32) {
        _require(message, BODY_OFFSET);
        return bytes32(message[RECIPIENT_OFFSET:RECIPIENT_OFFSET + 32]);
    }

    function body(bytes calldata message) internal pure returns (bytes calldata) {
        _require(message, BODY_OFFSET);
        return message[BODY_OFFSET:];
    }

    /// @notice Amount carried by a warp-route message body.
    function tokenAmount(bytes calldata message) internal pure returns (uint256) {
        _require(message, BODY_OFFSET + TOKEN_AMOUNT_END);
        bytes calldata b = message[BODY_OFFSET:];
        return uint256(bytes32(b[TOKEN_RECIPIENT_SIZE:TOKEN_AMOUNT_END]));
    }

    /// @notice Recipient carried by a warp-route message body.
    function tokenRecipient(bytes calldata message) internal pure returns (bytes32) {
        _require(message, BODY_OFFSET + TOKEN_AMOUNT_END);
        bytes calldata b = message[BODY_OFFSET:];
        return bytes32(b[0:TOKEN_RECIPIENT_SIZE]);
    }

    function _require(bytes calldata message, uint256 needed) private pure {
        if (message.length < needed) revert MessageTooShort(message.length, needed);
    }
}
