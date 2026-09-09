// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ArkBridgeGuardHook} from "../../src/bridge/ArkBridgeGuardHook.sol";
import {ArkBridgeGuardIsm} from "../../src/bridge/ArkBridgeGuardIsm.sol";
import {IInterchainSecurityModule, IPostDispatchHook} from "../../src/interfaces/IHyperlane.sol";
import {ArkMessage} from "../../src/libraries/ArkMessage.sol";
import {ArkBridgeGuard} from "../../src/security/ArkBridgeGuard.sol";
import {ArkBridgePauseController} from "../../src/security/ArkBridgePauseController.sol";
import {ArkBridgeRateLimiter} from "../../src/security/ArkBridgeRateLimiter.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Stand-in for the Mailbox's real hook (normally merkleTreeHook).
contract StubHook is IPostDispatchHook {
    uint256 public calls;
    uint256 public lastValue;

    function postDispatch(bytes calldata, bytes calldata) external payable override {
        calls++;
        lastValue = msg.value;
    }

    function quoteDispatch(bytes calldata, bytes calldata) external pure override returns (uint256) {
        return 7;
    }

    function hookType() external pure override returns (uint8) {
        return 3;
    }

    function supportsMetadata(bytes calldata) external pure override returns (bool) {
        return true;
    }
}

/// @notice An older Hyperlane hook: no hookType(), no supportsMetadata().
/// Sepolia's live merkleTreeHook behaves exactly like this.
contract LegacyHook is IPostDispatchHook {
    uint256 public calls;

    function postDispatch(bytes calldata, bytes calldata) external payable override {
        calls++;
    }

    function quoteDispatch(bytes calldata, bytes calldata) external pure override returns (uint256) {
        return 0;
    }

    function hookType() external pure override returns (uint8) {
        revert("not implemented");
    }

    function supportsMetadata(bytes calldata) external pure override returns (bool) {
        revert("not implemented");
    }
}

/// @notice Stand-in for a real multisig ISM.
contract StubIsm is IInterchainSecurityModule {
    bool public accept = true;
    uint256 public calls;

    function setAccept(bool a) external {
        accept = a;
    }

    function verify(bytes calldata, bytes calldata) external override returns (bool) {
        calls++;
        return accept;
    }

    function moduleType() external pure override returns (uint8) {
        return 5;
    }
}

contract GuardIntegrationTest is Test {
    ArkBridgeGuard internal guard;
    ArkBridgeRateLimiter internal limiter;
    ArkBridgePauseController internal pauser;
    ArkBridgeGuardHook internal hook;
    ArkBridgeGuardIsm internal ism;
    StubIsm internal inner;
    StubHook internal innerHook;

    address internal admin = makeAddr("admin");
    address internal config = makeAddr("config");
    address internal pauserAcct = makeAddr("pauserAcct");
    address internal mailbox = makeAddr("mailbox");
    address internal attacker = makeAddr("attacker");

    uint32 internal constant SEPOLIA = 11155111;
    uint32 internal constant ARK = 9000;

    bytes32 internal constant TOKEN = keccak256("sepolia-mockusdc");
    bytes32 internal constant IN_ROUTE = keccak256("sepolia:ark:usdc");
    bytes32 internal constant OUT_ROUTE = keccak256("ark:sepolia:usdc");

    bytes32 internal constant SEPOLIA_ROUTER = bytes32(uint256(uint160(0x454637b786478EB76aA93F8ad68101e90ba5d97D)));
    bytes32 internal constant ARK_ROUTER = bytes32(uint256(uint160(0x23AF193fa1fDa63e7396B185a22Ab83dDF8d2c6C)));

    uint256 internal constant PER_TX = 1_000e6;
    uint256 internal constant HOURLY = 5_000e6;
    uint256 internal constant DAILY = 20_000e6;

    function setUp() public {
        limiter = new ArkBridgeRateLimiter(admin);
        pauser = new ArkBridgePauseController(admin);
        guard = new ArkBridgeGuard(admin, limiter, pauser);
        inner = new StubIsm();
        innerHook = new StubHook();
        hook = new ArkBridgeGuardHook(guard, IPostDispatchHook(address(innerHook)));
        ism = new ArkBridgeGuardIsm(guard, IInterchainSecurityModule(address(inner)), mailbox);

        vm.startPrank(admin);
        limiter.grantRole(limiter.LIMIT_MANAGER_ROLE(), config);
        limiter.grantRole(limiter.CONFIG_ADMIN_ROLE(), address(guard));
        pauser.grantRole(pauser.PAUSER_ROLE(), pauserAcct);
        guard.grantRole(guard.CONFIG_ADMIN_ROLE(), config);
        vm.stopPrank();

        vm.startPrank(config);
        limiter.setLimits(IN_ROUTE, PER_TX, HOURLY, DAILY);
        limiter.setLimits(OUT_ROUTE, PER_TX, HOURLY, DAILY);
        guard.registerToken(TOKEN);
        guard.registerRoute(IN_ROUTE, SEPOLIA, ARK, TOKEN);
        guard.registerRoute(OUT_ROUTE, ARK, SEPOLIA, TOKEN);
        guard.setAuthorizedCaller(address(hook), true);
        guard.setAuthorizedCaller(address(ism), true);
        hook.bindRoute(ARK_ROUTER, SEPOLIA, OUT_ROUTE, TOKEN);
        ism.bindRoute(SEPOLIA_ROUTER, SEPOLIA, IN_ROUTE, TOKEN);
        vm.stopPrank();
    }

    /// Build a real Hyperlane v3 message.
    function _message(uint32 origin, bytes32 sender, uint32 destination, bytes32 recipient, uint256 amount)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(uint8(3), uint32(1), origin, sender, destination, recipient, recipient, amount);
    }

    // -- message parsing ----------------------------------------------------

    function test_parsesHyperlaneMessageFields() public view {
        bytes memory m = _message(SEPOLIA, SEPOLIA_ROUTER, ARK, ARK_ROUTER, 1234e6);
        assertEq(this.exposedOrigin(m), SEPOLIA);
        assertEq(this.exposedDestination(m), ARK);
        assertEq(this.exposedSender(m), SEPOLIA_ROUTER);
        assertEq(this.exposedAmount(m), 1234e6);
    }

    function exposedOrigin(bytes calldata m) external pure returns (uint32) {
        return ArkMessage.origin(m);
    }

    function exposedDestination(bytes calldata m) external pure returns (uint32) {
        return ArkMessage.destination(m);
    }

    function exposedSender(bytes calldata m) external pure returns (bytes32) {
        return ArkMessage.sender(m);
    }

    function exposedAmount(bytes calldata m) external pure returns (uint256) {
        return ArkMessage.tokenAmount(m);
    }

    /// A truncated message must revert, not read adjacent bytes as an amount.
    function test_truncatedMessageReverts() public {
        bytes memory short = new bytes(60);
        vm.expectRevert();
        this.exposedAmount(short);
    }

    // -- outbound (hook) ----------------------------------------------------

    function test_hookGatesOutboundTransfers() public {
        bytes memory m = _message(ARK, ARK_ROUTER, SEPOLIA, SEPOLIA_ROUTER, PER_TX);
        hook.postDispatch("", m);

        (uint256 hourly,) = limiter.windowsOf(OUT_ROUTE);
        assertEq(hourly, HOURLY - PER_TX, "outbound transfer did not consume capacity");
    }

    function test_hookBlocksPausedRoute() public {
        vm.prank(pauserAcct);
        pauser.pauseRoute(OUT_ROUTE, "incident");

        bytes memory m = _message(ARK, ARK_ROUTER, SEPOLIA, SEPOLIA_ROUTER, PER_TX);
        vm.expectRevert();
        hook.postDispatch("", m);
    }

    function test_hookBlocksOverLimit() public {
        bytes memory m = _message(ARK, ARK_ROUTER, SEPOLIA, SEPOLIA_ROUTER, PER_TX + 1);
        vm.expectRevert();
        hook.postDispatch("", m);
    }

    /// The hook occupies the router's only hook slot. If it did not forward,
    /// it would remove the merkle tree insertion every multisig ISM verifies
    /// against — dispatches would still succeed while the tree silently stopped
    /// growing, and every message would hang unverifiable. This happened on the
    /// first live deployment.
    function test_forwardsToTheWrappedHook() public {
        bytes memory m = _message(ARK, ARK_ROUTER, SEPOLIA, SEPOLIA_ROUTER, PER_TX);
        hook.postDispatch("", m);
        assertEq(innerHook.calls(), 1, "wrapped hook was not called");
    }

    /// Even traffic ArkBridge does not gate must reach the wrapped hook, or
    /// unrelated messages would stop being inserted into the tree.
    function test_forwardsUngatedTrafficToo() public {
        bytes32 stranger = bytes32(uint256(0xdead));
        bytes memory m = _message(ARK, stranger, SEPOLIA, SEPOLIA_ROUTER, type(uint256).max);
        hook.postDispatch("", m);
        assertEq(innerHook.calls(), 1, "ungated traffic bypassed the wrapped hook");
    }

    function test_forwardsValueAndQuote() public {
        bytes memory m = _message(ARK, ARK_ROUTER, SEPOLIA, SEPOLIA_ROUTER, PER_TX);
        hook.postDispatch{value: 5}("", m);
        assertEq(innerHook.lastValue(), 5, "value was not forwarded");
        assertEq(hook.quoteDispatch("", m), 7, "quote was not forwarded");
        assertEq(hook.hookType(), innerHook.hookType(), "hook type was not delegated");
    }

    /// ArkBridge spans chains whose Hyperlane deployments are different
    /// vintages. Sepolia's merkleTreeHook predates hookType() and reverts on
    /// it; an unguarded delegation made the wrapper unusable there.
    function test_toleratesAHookThatPredatesHookType() public {
        LegacyHook legacy = new LegacyHook();
        ArkBridgeGuardHook wrapper = new ArkBridgeGuardHook(guard, IPostDispatchHook(address(legacy)));

        assertEq(wrapper.hookType(), 0, "wrapper reverts on a legacy hook");
        assertTrue(wrapper.supportsMetadata(""), "wrapper reverts on legacy supportsMetadata");

        // Forwarding, which is what actually matters, still works.
        vm.prank(config);
        wrapper.bindRoute(ARK_ROUTER, SEPOLIA, OUT_ROUTE, TOKEN);
        vm.prank(config);
        guard.setAuthorizedCaller(address(wrapper), true);

        bytes memory m = _message(ARK, ARK_ROUTER, SEPOLIA, SEPOLIA_ROUTER, PER_TX);
        wrapper.postDispatch("", m);
        assertEq(legacy.calls(), 1, "legacy hook did not receive the dispatch");
    }

    /// A rejected transfer must not reach the wrapped hook either.
    function test_doesNotForwardWhenTheGuardRejects() public {
        vm.prank(pauserAcct);
        pauser.pauseRoute(OUT_ROUTE, "incident");

        bytes memory m = _message(ARK, ARK_ROUTER, SEPOLIA, SEPOLIA_ROUTER, PER_TX);
        vm.expectRevert();
        hook.postDispatch("", m);
        assertEq(innerHook.calls(), 0, "wrapped hook ran despite the guard rejecting");
    }

    /// The hook may share a Mailbox with unrelated traffic. Reverting other
    /// people's messages would be wrong and a denial of service.
    function test_hookIgnoresUnrelatedTraffic() public {
        bytes32 stranger = bytes32(uint256(0xdead));
        bytes memory m = _message(ARK, stranger, SEPOLIA, SEPOLIA_ROUTER, type(uint256).max);
        hook.postDispatch("", m); // must not revert

        (uint256 hourly,) = limiter.windowsOf(OUT_ROUTE);
        assertEq(hourly, HOURLY, "unrelated traffic consumed ArkBridge capacity");
    }

    // -- inbound (ISM) ------------------------------------------------------

    function test_ismGatesInboundTransfers() public {
        bytes memory m = _message(SEPOLIA, SEPOLIA_ROUTER, ARK, ARK_ROUTER, PER_TX);
        vm.prank(mailbox);
        assertTrue(ism.verify("", m));

        (uint256 hourly,) = limiter.windowsOf(IN_ROUTE);
        assertEq(hourly, HOURLY - PER_TX);
    }

    function test_ismBlocksPausedRoute() public {
        vm.prank(pauserAcct);
        pauser.pauseRoute(IN_ROUTE, "incident");

        bytes memory m = _message(SEPOLIA, SEPOLIA_ROUTER, ARK, ARK_ROUTER, PER_TX);
        vm.expectRevert();
        vm.prank(mailbox);
        ism.verify("", m);
    }

    // -- the ordering property ----------------------------------------------

    /// INV-13 in its sharpest form: an unauthenticated message must not consume
    /// a route's inbound allowance. If accounting ran before verification,
    /// anyone could throttle honest transfers for free by spamming forgeries.
    function test_INV13_rejectedMessagesConsumeNoInboundCapacity() public {
        inner.setAccept(false);
        (uint256 before,) = limiter.windowsOf(IN_ROUTE);

        for (uint256 i = 0; i < 5; i++) {
            bytes memory m = _message(SEPOLIA, SEPOLIA_ROUTER, ARK, ARK_ROUTER, PER_TX);
            vm.expectRevert(ArkBridgeGuardIsm.InnerIsmRejected.selector);
            vm.prank(mailbox);
            ism.verify("", m);
        }

        (uint256 afterSpam,) = limiter.windowsOf(IN_ROUTE);
        assertEq(afterSpam, before, "forged messages drained the inbound allowance");
    }

    /// `verify` mutates state, so only the Mailbox may call it. Otherwise
    /// anyone could drain capacity without delivering anything.
    function test_onlyMailboxCanVerify() public {
        bytes memory m = _message(SEPOLIA, SEPOLIA_ROUTER, ARK, ARK_ROUTER, PER_TX);
        vm.expectRevert(abi.encodeWithSelector(ArkBridgeGuardIsm.OnlyMailbox.selector, attacker));
        vm.prank(attacker);
        ism.verify("", m);
    }

    /// A relayer reads moduleType() to decide what metadata to build. If the
    /// wrapper reported its own type instead of the inner one, the relayer would
    /// submit metadata the inner ISM cannot verify — which is exactly how the
    /// first live deployment silently failed to deliver.
    function test_moduleTypeDelegatesToInnerIsm() public view {
        assertEq(ism.moduleType(), inner.moduleType(), "wrapper hides the inner module type");
        assertEq(ism.moduleType(), 5, "expected MESSAGE_ID_MULTISIG from the stub");
    }

    /// The wrapper can only ever be more restrictive than the ISM it wraps.
    function test_wrapperNeverWeakensTheInnerIsm() public {
        inner.setAccept(false);
        bytes32 stranger = bytes32(uint256(0xbeef));
        bytes memory m = _message(SEPOLIA, stranger, ARK, ARK_ROUTER, PER_TX);

        // Not an ArkBridge route, so ArkBridge adds nothing — but the inner ISM
        // still rejects it.
        vm.expectRevert(ArkBridgeGuardIsm.InnerIsmRejected.selector);
        vm.prank(mailbox);
        ism.verify("", m);
    }

    // -- INV-15 through the real message path -------------------------------

    /// A message whose origin does not match the bound route must not
    /// authorise anything, even if its sender is a known router.
    function test_INV15_originMismatchRejected() public {
        vm.prank(config);
        ism.bindRoute(SEPOLIA_ROUTER, 97, IN_ROUTE, TOKEN);

        bytes memory m = _message(97, SEPOLIA_ROUTER, ARK, ARK_ROUTER, PER_TX);
        vm.expectRevert(
            abi.encodeWithSelector(ArkBridgeGuard.OriginDomainMismatch.selector, IN_ROUTE, SEPOLIA, uint32(97))
        );
        vm.prank(mailbox);
        ism.verify("", m);
    }

    // -- both directions share nothing --------------------------------------

    function test_inboundAndOutboundHaveIndependentCapacity() public {
        bytes memory inbound = _message(SEPOLIA, SEPOLIA_ROUTER, ARK, ARK_ROUTER, PER_TX);
        vm.prank(mailbox);
        ism.verify("", inbound);

        (uint256 inHourly,) = limiter.windowsOf(IN_ROUTE);
        (uint256 outHourly,) = limiter.windowsOf(OUT_ROUTE);
        assertEq(inHourly, HOURLY - PER_TX);
        assertEq(outHourly, HOURLY, "inbound traffic throttled the exit");
    }
}
