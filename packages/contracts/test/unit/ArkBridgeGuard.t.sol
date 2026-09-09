// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IArkBridgePauseController} from "../../src/interfaces/IArkBridgePauseController.sol";
import {IArkBridgeRateLimiter} from "../../src/interfaces/IArkBridgeRateLimiter.sol";
import {ArkBridgeGuard} from "../../src/security/ArkBridgeGuard.sol";
import {ArkBridgePauseController} from "../../src/security/ArkBridgePauseController.sol";
import {ArkBridgeRateLimiter} from "../../src/security/ArkBridgeRateLimiter.sol";
import {Test} from "forge-std/Test.sol";

contract ArkBridgeGuardTest is Test {
    ArkBridgeGuard internal guard;
    ArkBridgeRateLimiter internal limiter;
    ArkBridgePauseController internal pauser;

    address internal admin = makeAddr("admin");
    address internal config = makeAddr("config");
    address internal pauserAcct = makeAddr("pauserAcct");
    address internal router = makeAddr("router");
    address internal attacker = makeAddr("attacker");

    uint32 internal constant SEPOLIA = 11155111;
    uint32 internal constant ARK = 9000;
    uint32 internal constant BSC = 97;

    bytes32 internal constant USDC = keccak256("sepolia-mockusdc");
    bytes32 internal constant UNLISTED = keccak256("sepolia-scamcoin");
    bytes32 internal constant ROUTE = keccak256("sepolia:ark:usdc");
    bytes32 internal constant UNLISTED_ROUTE = keccak256("sepolia:bsc:usdc");

    uint256 internal constant PER_TX = 1_000e6;
    uint256 internal constant HOURLY = 5_000e6;
    uint256 internal constant DAILY = 20_000e6;

    function setUp() public {
        limiter = new ArkBridgeRateLimiter(admin);
        pauser = new ArkBridgePauseController(admin);
        guard = new ArkBridgeGuard(admin, limiter, pauser);

        vm.startPrank(admin);
        limiter.grantRole(limiter.LIMIT_MANAGER_ROLE(), config);
        // Only the guard may consume capacity. This is what makes the guard the
        // single entry point rather than merely the intended one.
        limiter.grantRole(limiter.CONFIG_ADMIN_ROLE(), address(guard));
        pauser.grantRole(pauser.PAUSER_ROLE(), pauserAcct);
        guard.grantRole(guard.CONFIG_ADMIN_ROLE(), config);
        vm.stopPrank();

        vm.startPrank(config);
        limiter.setLimits(ROUTE, PER_TX, HOURLY, DAILY);
        guard.registerToken(USDC);
        guard.registerRoute(ROUTE, SEPOLIA, ARK, USDC);
        guard.setAuthorizedCaller(router, true);
        vm.stopPrank();
    }

    function _authorize(uint256 amount) internal {
        vm.prank(router);
        guard.authorizeTransfer(ROUTE, USDC, SEPOLIA, amount);
    }

    function test_happyPath() public {
        _authorize(PER_TX);
        (uint256 hourly,) = limiter.windowsOf(ROUTE);
        assertEq(hourly, HOURLY - PER_TX);
    }

    // -- INV-01 / INV-02 ----------------------------------------------------

    function test_INV01_unsupportedAssetCannotBridge() public {
        vm.prank(config);
        guard.registerRoute(keccak256("r2"), SEPOLIA, ARK, UNLISTED);

        vm.expectRevert(abi.encodeWithSelector(ArkBridgeGuard.UnsupportedToken.selector, UNLISTED));
        vm.prank(router);
        guard.authorizeTransfer(keccak256("r2"), UNLISTED, SEPOLIA, 1);
    }

    function test_INV02_unsupportedRouteCannotBridge() public {
        vm.expectRevert(abi.encodeWithSelector(ArkBridgeGuard.UnsupportedRoute.selector, UNLISTED_ROUTE));
        vm.prank(router);
        guard.authorizeTransfer(UNLISTED_ROUTE, USDC, SEPOLIA, 1);
    }

    /// A registered route carries a specific asset. Presenting a different one
    /// must not slip through just because both are individually registered.
    function test_INV02_routeAndTokenMustMatch() public {
        vm.prank(config);
        guard.registerToken(UNLISTED);

        vm.expectRevert(abi.encodeWithSelector(ArkBridgeGuard.RouteTokenMismatch.selector, ROUTE, USDC, UNLISTED));
        vm.prank(router);
        guard.authorizeTransfer(ROUTE, UNLISTED, SEPOLIA, 1);
    }

    // -- INV-15: origin domain ----------------------------------------------

    /// The caller supplies the origin it read from the message; the guard
    /// decides whether that matches the route being claimed. A message asserting
    /// a different origin must not authorise a mint or a release.
    function test_INV15_wrongOriginDomainCannotAuthorize() public {
        vm.expectRevert(abi.encodeWithSelector(ArkBridgeGuard.OriginDomainMismatch.selector, ROUTE, SEPOLIA, BSC));
        vm.prank(router);
        guard.authorizeTransfer(ROUTE, USDC, BSC, PER_TX);
    }

    function testFuzz_INV15_onlyTheRegisteredOriginIsAccepted(uint32 claimed) public {
        vm.assume(claimed != SEPOLIA);
        vm.expectRevert(abi.encodeWithSelector(ArkBridgeGuard.OriginDomainMismatch.selector, ROUTE, SEPOLIA, claimed));
        vm.prank(router);
        guard.authorizeTransfer(ROUTE, USDC, claimed, 1);
    }

    // -- INV-12: pause cannot be bypassed -----------------------------------

    function test_INV12_pauseBlocksTheGuard() public {
        vm.prank(pauserAcct);
        pauser.pauseRoute(ROUTE, "incident");

        vm.expectRevert(
            abi.encodeWithSelector(
                IArkBridgePauseController.TransferPaused.selector, IArkBridgePauseController.Scope.Route, ROUTE
            )
        );
        vm.prank(router);
        guard.authorizeTransfer(ROUTE, USDC, SEPOLIA, 1);
    }

    /// The bypass this invariant is really about: reaching the rate limiter
    /// directly, skipping the pause check. Only the guard holds the role that
    /// permits consumption, so there is no second door.
    function test_INV12_cannotReachRateLimiterDirectly() public {
        vm.prank(pauserAcct);
        pauser.pauseRoute(ROUTE, "incident");

        vm.expectRevert();
        vm.prank(router);
        limiter.consume(ROUTE, PER_TX);

        vm.expectRevert();
        vm.prank(attacker);
        limiter.consume(ROUTE, PER_TX);

        (uint256 hourly,) = limiter.windowsOf(ROUTE);
        assertEq(hourly, HOURLY, "capacity was consumed while the route was paused");
    }

    function test_unauthorizedCallerRejected() public {
        vm.expectRevert(abi.encodeWithSelector(ArkBridgeGuard.UnauthorizedCaller.selector, attacker));
        vm.prank(attacker);
        guard.authorizeTransfer(ROUTE, USDC, SEPOLIA, 1);
    }

    // -- ordering: a rejected transfer must not burn capacity ---------------

    /// Checks run before consumption. Otherwise anyone able to trigger a
    /// doomed transfer could drain a route's allowance for free — a denial of
    /// service that costs the attacker nothing.
    function test_rejectedTransfersDoNotConsumeCapacity() public {
        (uint256 before,) = limiter.windowsOf(ROUTE);

        vm.prank(pauserAcct);
        pauser.pauseRoute(ROUTE, "incident");
        vm.expectRevert();
        vm.prank(router);
        guard.authorizeTransfer(ROUTE, USDC, SEPOLIA, PER_TX);

        vm.expectRevert();
        vm.prank(router);
        guard.authorizeTransfer(ROUTE, USDC, BSC, PER_TX);

        (uint256 afterFailures,) = limiter.windowsOf(ROUTE);
        assertEq(afterFailures, before, "a rejected transfer consumed rate-limit capacity");
    }

    // -- INV-14: mappings are not silently replaced -------------------------

    function test_INV14_routeCannotBeSilentlyReplaced() public {
        vm.expectRevert(abi.encodeWithSelector(ArkBridgeGuard.RouteAlreadyRegistered.selector, ROUTE));
        vm.prank(config);
        guard.registerRoute(ROUTE, BSC, ARK, USDC);

        assertEq(guard.routeOf(ROUTE).originDomain, SEPOLIA, "route origin was overwritten");
    }

    // -- availableCapacity for the UI ---------------------------------------

    function test_availableCapacityIsZeroWhenPaused() public {
        assertGt(guard.availableCapacity(ROUTE), 0);

        vm.prank(pauserAcct);
        pauser.pauseRoute(ROUTE, "incident");

        assertEq(guard.availableCapacity(ROUTE), 0, "paused route still advertises capacity");
    }

    function test_availableCapacityIsZeroForUnknownRoute() public view {
        assertEq(guard.availableCapacity(UNLISTED_ROUTE), 0);
    }

    /// Whatever the guard advertises must actually be accepted, or the UI walks
    /// users into a wallet confirmation that reverts.
    function testFuzz_advertisedCapacityIsHonoured(uint256 amount) public {
        uint256 advertised = guard.availableCapacity(ROUTE);
        amount = bound(amount, 1, advertised);
        _authorize(amount);
    }
}
