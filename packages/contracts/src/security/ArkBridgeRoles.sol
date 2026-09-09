// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ArkBridgeRoles
/// @notice Shared role definitions for ArkBridge's safety contracts.
/// @dev Roles are split by blast radius, not by convenience. The separation
///      that matters:
///
///      - PAUSER can only stop things. Handing it out widely is cheap, because
///        the worst a compromised pauser does is deny service — which is also
///        what an attacker is trying to prevent you from doing.
///      - LIMIT_MANAGER can raise limits, which is how value leaves faster than
///        anyone can react. It is strictly more dangerous than PAUSER and must
///        not be bundled with it.
///      - CONFIG_ADMIN can change what is bridgeable at all.
///      - UPGRADE_ADMIN can replace code, and therefore every other guarantee.
///
///      DEFAULT_ADMIN_ROLE grants and revokes the rest. On mainnet it must be a
///      multisig behind a timelock; an EOA holding it makes every other role
///      cosmetic. `assertNoEoaAdmin` exists so deployment tooling can enforce
///      that rather than trust a checklist.
abstract contract ArkBridgeRoles is AccessControl {
    /// @notice May pause. Cannot unpause — see `UNPAUSER_ROLE`.
    bytes32 public constant PAUSER_ROLE = keccak256("ARKBRIDGE_PAUSER_ROLE");

    /// @notice May resume paused routes.
    /// @dev Deliberately separate from PAUSER_ROLE. Pausing is an emergency
    ///      action that should be easy; unpausing is a decision that the danger
    ///      has passed, and should not be available to whoever happened to be
    ///      able to hit the stop button.
    bytes32 public constant UNPAUSER_ROLE = keccak256("ARKBRIDGE_UNPAUSER_ROLE");

    /// @notice May change transfer limits.
    bytes32 public constant LIMIT_MANAGER_ROLE = keccak256("ARKBRIDGE_LIMIT_MANAGER_ROLE");

    /// @notice May register or deregister chains, tokens and routes.
    bytes32 public constant CONFIG_ADMIN_ROLE = keccak256("ARKBRIDGE_CONFIG_ADMIN_ROLE");

    /// @notice May authorise proxy upgrades.
    bytes32 public constant UPGRADE_ADMIN_ROLE = keccak256("ARKBRIDGE_UPGRADE_ADMIN_ROLE");

    error AdminMustNotBeEoa(address admin);
    error AdminMustNotBeZero();

    /// @notice Revert unless `admin` is a contract.
    /// @dev A multisig is a contract; an EOA is not. This does not prove the
    ///      contract is a *good* multisig — only that production authority is
    ///      not sitting behind one key. Production deployment scripts call this;
    ///      it is deliberately not enforced in the constructor so that tests and
    ///      local devnets can use EOAs.
    function assertNoEoaAdmin(address admin) public view {
        if (admin == address(0)) revert AdminMustNotBeZero();
        if (admin.code.length == 0) revert AdminMustNotBeEoa(admin);
    }
}
