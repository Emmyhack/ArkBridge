// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IInterchainSecurityModule} from "../../src/interfaces/IHyperlane.sol";
import {ArkBridgeRecoveryIsm} from "../../src/security/ArkBridgeRecoveryIsm.sol";
import {Test} from "forge-std/Test.sol";

contract RejectingIsm is IInterchainSecurityModule {
    uint256 public calls;

    function verify(bytes calldata, bytes calldata) external override returns (bool) {
        calls++;
        return false;
    }

    function moduleType() external pure override returns (uint8) {
        return 5;
    }
}

contract ArkBridgeRecoveryIsmTest is Test {
    ArkBridgeRecoveryIsm internal recovery;
    RejectingIsm internal inner;

    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    bytes internal stranded = hex"deadbeef";
    bytes internal other = hex"c0ffee";

    function setUp() public {
        inner = new RejectingIsm();
        recovery = new ArkBridgeRecoveryIsm(IInterchainSecurityModule(address(inner)), owner);
    }

    /// The whole point: an allowlisted message is delivered, and nothing else is.
    function test_recoversOnlyTheAllowlistedMessage() public {
        vm.prank(owner);
        recovery.allow(keccak256(stranded));

        assertTrue(recovery.verify("", stranded), "allowlisted message was not recovered");
        assertEq(inner.calls(), 0, "recovery should not consult the inner ISM");

        // Everything else still faces the real ISM, which here rejects.
        assertFalse(recovery.verify("", other), "a non-allowlisted message bypassed verification");
        assertEq(inner.calls(), 1, "the inner ISM was skipped for normal traffic");
    }

    /// INV-06: recovery must not become a standing bypass for the same message.
    function test_INV06_allowlistEntryIsSingleUse() public {
        vm.prank(owner);
        recovery.allow(keccak256(stranded));

        assertTrue(recovery.verify("", stranded));
        assertFalse(recovery.verify("", stranded), "the same message was recovered twice");
        assertEq(recovery.recoveredCount(), 1);
    }

    /// The allowlist binds to exact bytes, so a nearly-identical message — a
    /// different amount, a different recipient — is not covered by it.
    function test_allowlistBindsToExactMessageBytes() public {
        vm.prank(owner);
        recovery.allow(keccak256(stranded));

        bytes memory tampered = hex"deadbeff";
        assertFalse(recovery.verify("", tampered), "a modified message reused the allowlist entry");
    }

    function test_onlyOwnerCanAllow() public {
        vm.expectRevert(abi.encodeWithSelector(ArkBridgeRecoveryIsm.NotOwner.selector, stranger));
        vm.prank(stranger);
        recovery.allow(keccak256(stranded));
    }

    function test_ownerCanRevokeBeforeUse() public {
        vm.startPrank(owner);
        recovery.allow(keccak256(stranded));
        recovery.revoke(keccak256(stranded));
        vm.stopPrank();

        assertFalse(recovery.verify("", stranded), "a revoked entry still recovered");
    }

    /// Normal traffic keeps full verification the entire time this is installed.
    function testFuzz_nonAllowlistedMessagesAlwaysReachTheInnerIsm(bytes calldata message) public {
        vm.assume(keccak256(message) != keccak256(stranded));
        uint256 before = inner.calls();
        recovery.verify("", message);
        assertEq(inner.calls(), before + 1, "a message skipped the inner ISM");
    }

    /// A relayer keys metadata construction off moduleType; hiding the inner
    /// module's answer would break verification for everything not recovered.
    function test_moduleTypeIsForwarded() public view {
        assertEq(recovery.moduleType(), inner.moduleType());
    }
}
