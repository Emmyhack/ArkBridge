// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ArkBridgeGuardHook} from "../src/bridge/ArkBridgeGuardHook.sol";
import {ArkBridgeGuardIsm} from "../src/bridge/ArkBridgeGuardIsm.sol";
import {IInterchainSecurityModule, IPostDispatchHook} from "../src/interfaces/IHyperlane.sol";
import {ArkBridgeGuard} from "../src/security/ArkBridgeGuard.sol";
import {ArkBridgePauseController} from "../src/security/ArkBridgePauseController.sol";
import {ArkBridgeRateLimiter} from "../src/security/ArkBridgeRateLimiter.sol";
import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

/// @notice Deploys and wires the ArkBridge safety layer on one chain.
///
/// @dev Roles are all granted to the deployer here because this is a devnet.
///      On mainnet each role goes to a different multisig and DEFAULT_ADMIN is
///      timelocked — `ArkBridgeRoles.assertNoEoaAdmin` exists so the production
///      script can enforce that rather than rely on this comment.
contract DeployGuard is Script {
    function run() external {
        address admin = vm.envAddress("GUARD_ADMIN");
        address mailbox = vm.envAddress("GUARD_MAILBOX");
        address innerIsm = vm.envAddress("GUARD_INNER_ISM");
        // The hook this one wraps — the Mailbox's existing default, normally
        // merkleTreeHook. Wrapping rather than replacing is mandatory: the
        // router has one hook slot, and dropping the merkle insertion silently
        // breaks every multisig ISM that verifies against the tree.
        address innerHook = vm.envAddress("GUARD_INNER_HOOK");

        vm.startBroadcast();

        ArkBridgeRateLimiter limiter = new ArkBridgeRateLimiter(admin);
        ArkBridgePauseController pauser = new ArkBridgePauseController(admin);
        ArkBridgeGuard guard = new ArkBridgeGuard(admin, limiter, pauser);
        ArkBridgeGuardHook hook = new ArkBridgeGuardHook(guard, IPostDispatchHook(innerHook));
        ArkBridgeGuardIsm ism = new ArkBridgeGuardIsm(guard, IInterchainSecurityModule(innerIsm), mailbox);

        // The guard holds the ONLY role permitted to consume limit capacity.
        // That is what makes it the single entry point rather than merely the
        // intended one — see ArkBridgeGuard's contract comment.
        limiter.grantRole(limiter.CONFIG_ADMIN_ROLE(), address(guard));
        limiter.grantRole(limiter.LIMIT_MANAGER_ROLE(), admin);
        pauser.grantRole(pauser.PAUSER_ROLE(), admin);
        pauser.grantRole(pauser.UNPAUSER_ROLE(), admin);
        guard.grantRole(guard.CONFIG_ADMIN_ROLE(), admin);

        // Only the hook and the ISM may ask the guard to authorise anything.
        guard.setAuthorizedCaller(address(hook), true);
        guard.setAuthorizedCaller(address(ism), true);

        vm.stopBroadcast();

        console.log("rateLimiter", address(limiter));
        console.log("pauseController", address(pauser));
        console.log("guard", address(guard));
        console.log("guardHook", address(hook));
        console.log("guardIsm", address(ism));
    }
}
