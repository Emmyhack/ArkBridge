// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

/**
 * Fork tests for INV-06 and INV-09.
 *
 * These two invariants were the last entries in docs/security/invariants.md
 * still marked partial, and for an honest reason: both are properties of
 * Hyperlane's deployed Mailbox and router rather than of ArkBridge's own gate,
 * and the document said plainly that ArkBridge relied on upstream for them and
 * had not verified either.
 *
 * A unit test cannot close that gap. Replay protection lives in the Mailbox's
 * own storage, and release authorisation lives in the router's `onlyMailbox`
 * plus its enrolled-router table — neither can be exercised against a local
 * mock without testing the mock instead of the deployment. So these run against
 * the live chains, at a real block, using a real message that real validators
 * really signed.
 *
 * They skip rather than fail when the RPC variables are absent, because a
 * contributor without devnet credentials should still get a green suite; CI
 * with secrets runs them for real. A skipped test is visible in the output, so
 * this cannot quietly become a suite that verifies nothing.
 */
interface IMailbox {
    function delivered(bytes32 messageId) external view returns (bool);
    function process(bytes calldata metadata, bytes calldata message) external payable;
    function localDomain() external view returns (uint32);
}

interface IRouter {
    function handle(uint32 origin, bytes32 sender, bytes calldata message) external payable;
    function routers(uint32 domain) external view returns (bytes32);
    function interchainSecurityModule() external view returns (address);
}

interface IInterchainSecurityModule {
    function moduleType() external view returns (uint8);
}

contract ForkInvariantsTest is Test {
    // Ark Constellation devnet, from deployments/testnet/ark-devnet.json.
    address internal constant ARK_MAILBOX = 0xe441256be7296Fc42d2597A54dcD42E2C70cCb68;
    address internal constant ARK_SYNTHETIC = 0x23AF193fa1fDa63e7396B185a22Ab83dDF8d2c6C;
    uint32 internal constant ARK_DOMAIN = 9000;

    // Sepolia, from deployments/testnet/sepolia.json.
    address internal constant SEPOLIA_COLLATERAL_ROUTER = 0x454637b786478EB76aA93F8ad68101e90ba5d97D;
    address internal constant SEPOLIA_MAILBOX = 0xfFAEF09B3cd11D9b20d1a19bECca54EEC2884766;
    uint32 internal constant SEPOLIA_DOMAIN = 11155111;

    function _rpc(string memory key) internal view returns (string memory url) {
        url = vm.envOr(key, string(""));
    }

    // ---------------------------------------------------------------- INV-06

    /**
     * INV-06: a message cannot create credit twice.
     *
     * Forks Ark one block *before* a real delivery, replays that delivery from
     * its original calldata — which succeeds, proving the captured bytes and
     * signatures are genuine and not a fabricated fixture — and then submits
     * the identical bytes a second time, which must revert.
     *
     * Doing it in that order matters. Asserting only that a second submission
     * reverts would pass just as well against a Mailbox that rejected the
     * message for some unrelated reason, or against calldata that was never
     * valid to begin with. Establishing the success first is what makes the
     * failure afterwards mean what it claims to mean.
     */
    function test_INV06_deliveredMessageCannotBeReplayed() public {
        string memory url = _rpc("ARK_RPC_URL");
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }

        string memory raw = vm.readFile("test/fork/delivered-message.json");
        uint256 blockNumber = vm.parseJsonUint(raw, ".blockNumber");
        bytes memory calldata_ = vm.parseJsonBytes(raw, ".processCalldata");

        vm.createSelectFork(url, blockNumber - 1);

        (bytes memory metadata, bytes memory message) = _decodeProcess(calldata_);
        bytes32 messageId = keccak256(message);

        IMailbox mailbox = IMailbox(ARK_MAILBOX);
        assertEq(mailbox.localDomain(), ARK_DOMAIN, "forked the wrong chain");
        assertFalse(mailbox.delivered(messageId), "message already delivered at the parent block");

        // First delivery: real metadata, real validator signatures, real message.
        mailbox.process(metadata, message);
        assertTrue(mailbox.delivered(messageId), "delivery did not record the message");

        // Second delivery of the identical bytes must not mint again.
        vm.expectRevert();
        mailbox.process(metadata, message);
    }

    // ---------------------------------------------------------------- INV-09

    /**
     * INV-09: collateral cannot be released without an authenticated return.
     *
     * The release path on the source chain is the collateral router's `handle`.
     * Two gates stand in front of it, and this asserts both against the
     * deployed contract:
     *
     *   1. Only the Mailbox may call it. Anyone else — including an address
     *      holding every role ArkBridge defines — is rejected outright.
     *   2. Even called *as* the Mailbox, the message must come from the
     *      enrolled router on the origin domain. A forged sender on the right
     *      domain, or the right sender on an unenrolled domain, is rejected.
     *
     * Together these are what stops a release being conjured without a message
     * that the multisig ISM has already verified.
     */
    function test_INV09_collateralReleaseRequiresAuthenticatedMessage() public {
        string memory url = _rpc("SEPOLIA_RPC_URL");
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork(url);

        IRouter router = IRouter(SEPOLIA_COLLATERAL_ROUTER);
        bytes32 arkRouter = router.routers(ARK_DOMAIN);
        assertTrue(arkRouter != bytes32(0), "Ark router is not enrolled on the collateral router");

        // A plausible release instruction: recipient, then amount.
        bytes memory release = abi.encodePacked(bytes32(uint256(uint160(address(this)))), uint256(1_000e6));

        // 1. Not the Mailbox.
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert();
        router.handle(ARK_DOMAIN, arkRouter, release);

        // 2. The Mailbox, but the sender is not the enrolled Ark router.
        bytes32 forged = bytes32(uint256(uint160(attacker)));
        vm.prank(SEPOLIA_MAILBOX);
        vm.expectRevert();
        router.handle(ARK_DOMAIN, forged, release);

        // 3. The Mailbox and the real router bytes, but an origin domain that
        //    has no enrolled router at all.
        vm.prank(SEPOLIA_MAILBOX);
        vm.expectRevert();
        router.handle(uint32(424242), arkRouter, release);
    }

    /**
     * The other half of INV-09: the module that authenticates those messages is
     * ArkBridge's own, not an inherited default.
     *
     * A router whose ISM is a trusted-relayer module would satisfy every access
     * check above and still release collateral on the say-so of one key. The
     * deployed router must name a module, and it must not be the null address —
     * which for Hyperlane means "fall back to the Mailbox default", a value
     * ArkBridge does not control.
     */
    function test_INV09_collateralRouterUsesItsOwnSecurityModule() public {
        string memory url = _rpc("SEPOLIA_RPC_URL");
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork(url);

        address ism = IRouter(SEPOLIA_COLLATERAL_ROUTER).interchainSecurityModule();
        assertTrue(ism != address(0), "collateral router falls back to the Mailbox default ISM");

        // MESSAGE_ID_MULTISIG (5) or MERKLE_ROOT_MULTISIG (4) — either is a
        // signature threshold. NULL (0) and UNUSED are not.
        uint8 moduleType = IInterchainSecurityModule(ism).moduleType();
        assertTrue(
            moduleType == 4 || moduleType == 5 || moduleType == 2, "release ISM is not a multisig or aggregation"
        );
    }

    /// Strips the 4-byte selector and decodes `process(bytes,bytes)`.
    function _decodeProcess(bytes memory input) internal pure returns (bytes memory metadata, bytes memory message) {
        require(input.length > 4, "calldata too short");
        bytes memory args = new bytes(input.length - 4);
        for (uint256 i = 0; i < args.length; i++) {
            args[i] = input[i + 4];
        }
        (metadata, message) = abi.decode(args, (bytes, bytes));
    }
}
