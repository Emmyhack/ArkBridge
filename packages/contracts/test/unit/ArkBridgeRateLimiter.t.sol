// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IArkBridgeRateLimiter} from "../../src/interfaces/IArkBridgeRateLimiter.sol";
import {ArkBridgeRateLimiter} from "../../src/security/ArkBridgeRateLimiter.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Test} from "forge-std/Test.sol";

contract ArkBridgeRateLimiterTest is Test {
    ArkBridgeRateLimiter internal limiter;

    address internal admin = makeAddr("admin");
    address internal limitManager = makeAddr("limitManager");
    address internal consumer = makeAddr("consumer");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant ROUTE = keccak256("sepolia:ark:usdc");
    bytes32 internal constant OTHER_ROUTE = keccak256("ark:sepolia:usdc");

    uint256 internal constant PER_TX = 1_000e6;
    uint256 internal constant HOURLY = 5_000e6;
    uint256 internal constant DAILY = 20_000e6;

    function setUp() public {
        limiter = new ArkBridgeRateLimiter(admin);
        vm.startPrank(admin);
        limiter.grantRole(limiter.LIMIT_MANAGER_ROLE(), limitManager);
        limiter.grantRole(limiter.CONFIG_ADMIN_ROLE(), consumer);
        vm.stopPrank();

        vm.prank(limitManager);
        limiter.setLimits(ROUTE, PER_TX, HOURLY, DAILY);
    }

    // -- configuration ------------------------------------------------------

    function test_rejectsUnorderedLimits() public {
        vm.startPrank(limitManager);
        // per-transaction above hourly makes the cap unreachable
        vm.expectRevert(abi.encodeWithSelector(IArkBridgeRateLimiter.InvalidLimits.selector, 10, 5, 100));
        limiter.setLimits(OTHER_ROUTE, 10, 5, 100);
        // hourly above daily is likewise incoherent
        vm.expectRevert(abi.encodeWithSelector(IArkBridgeRateLimiter.InvalidLimits.selector, 1, 200, 100));
        limiter.setLimits(OTHER_ROUTE, 1, 200, 100);
        vm.stopPrank();
    }

    function test_rejectsZeroLimits() public {
        vm.prank(limitManager);
        vm.expectRevert(abi.encodeWithSelector(IArkBridgeRateLimiter.InvalidLimits.selector, 0, 5, 100));
        limiter.setLimits(OTHER_ROUTE, 0, 5, 100);
    }

    function test_onlyLimitManagerCanSetLimits() public {
        bytes32 role = limiter.LIMIT_MANAGER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        limiter.setLimits(OTHER_ROUTE, PER_TX, HOURLY, DAILY);
    }

    function test_unconfiguredRouteCannotConsume() public {
        vm.prank(consumer);
        vm.expectRevert(abi.encodeWithSelector(IArkBridgeRateLimiter.LimitsNotSet.selector, OTHER_ROUTE));
        limiter.consume(OTHER_ROUTE, 1);
    }

    // -- per-transaction cap ------------------------------------------------

    function test_rejectsAbovePerTransactionCap() public {
        vm.prank(consumer);
        vm.expectRevert(
            abi.encodeWithSelector(IArkBridgeRateLimiter.ExceedsPerTransaction.selector, ROUTE, PER_TX + 1, PER_TX)
        );
        limiter.consume(ROUTE, PER_TX + 1);
    }

    function test_acceptsExactlyPerTransactionCap() public {
        vm.prank(consumer);
        limiter.consume(ROUTE, PER_TX);
    }

    // -- INV-11: splitting must not defeat the aggregate --------------------

    /// Many small transfers must be bounded by the same hourly allowance as one
    /// large one. This is the invariant a fixed window gets wrong.
    function test_INV11_splittingCannotExceedHourly() public {
        uint256 chunk = PER_TX / 4;
        uint256 moved;

        vm.startPrank(consumer);
        for (uint256 i = 0; i < 1000; i++) {
            (uint256 hourly,) = limiter.windowsOf(ROUTE);
            if (chunk > hourly) break;
            limiter.consume(ROUTE, chunk);
            moved += chunk;
        }
        vm.stopPrank();

        assertLe(moved, HOURLY, "splitting moved more than the hourly allowance");
        assertGe(moved, HOURLY - chunk, "splitting should still reach close to the allowance");
    }

    /// The boundary case a fixed window fails: drain, wait until just before the
    /// window would "reset", and try again. With a token bucket only the elapsed
    /// fraction has refilled.
    function test_INV11_noBurstAcrossWindowBoundary() public {
        vm.startPrank(consumer);
        for (uint256 i = 0; i < HOURLY / PER_TX; i++) {
            limiter.consume(ROUTE, PER_TX);
        }
        vm.stopPrank();

        (uint256 hourlyLeft,) = limiter.windowsOf(ROUTE);
        assertEq(hourlyLeft, 0, "hourly allowance should be exhausted");

        // One second before a full hour has passed, only ~(3599/3600) has refilled.
        vm.warp(block.timestamp + 1 hours - 1);
        (uint256 refilled,) = limiter.windowsOf(ROUTE);
        assertLt(refilled, HOURLY, "a full hour had not elapsed, so the bucket must not be full");

        vm.warp(block.timestamp + 1);
        (uint256 full,) = limiter.windowsOf(ROUTE);
        assertEq(full, HOURLY, "a full hour elapsed, so the bucket should be full");
    }

    // -- refill behaviour ---------------------------------------------------

    function test_refillsLinearly() public {
        vm.startPrank(consumer);
        for (uint256 i = 0; i < HOURLY / PER_TX; i++) {
            limiter.consume(ROUTE, PER_TX);
        }
        vm.stopPrank();

        vm.warp(block.timestamp + 30 minutes);
        (uint256 hourly,) = limiter.windowsOf(ROUTE);
        assertApproxEqRel(hourly, HOURLY / 2, 1e15, "half a period should refill about half");
    }

    /// Drain in hourly-sized bites, letting the hourly bucket refill fully
    /// between each, so that only the daily bucket can bind.
    ///
    /// The bound is not a constant: over an elapsed span T the daily bucket
    /// refills `DAILY * T / 1 days` on top of its initial capacity. Asserting a
    /// fixed number here would be asserting the test's own arithmetic rather
    /// than the contract's behaviour.
    function test_dailyBindsEvenWhenHourlyRefills() public {
        uint256 start = block.timestamp;
        uint256 moved;

        vm.startPrank(consumer);
        for (uint256 i = 0; i < 100; i++) {
            (, uint256 daily) = limiter.windowsOf(ROUTE);
            if (daily < PER_TX) break;
            limiter.consume(ROUTE, PER_TX);
            moved += PER_TX;
            vm.warp(block.timestamp + 1 hours);
        }
        vm.stopPrank();

        uint256 elapsed = block.timestamp - start;
        uint256 permitted = DAILY + (DAILY * elapsed) / 1 days;
        assertLe(moved, permitted, "moved more than capacity plus refill over the elapsed span");
    }

    /// The same property stated without any time passing: with no refill, the
    /// daily capacity is a hard ceiling however the transfer is split.
    function test_dailyIsAHardCeilingWithinASingleInstant() public {
        vm.prank(limitManager);
        limiter.setLimits(OTHER_ROUTE, DAILY, DAILY, DAILY);

        uint256 moved;
        vm.startPrank(consumer);
        for (uint256 i = 0; i < 50; i++) {
            (, uint256 daily) = limiter.windowsOf(OTHER_ROUTE);
            uint256 chunk = DAILY / 10;
            if (chunk > daily) break;
            limiter.consume(OTHER_ROUTE, chunk);
            moved += chunk;
        }
        vm.stopPrank();

        assertEq(moved, DAILY, "with no time elapsed, exactly the daily capacity should be movable");
    }

    // -- reconfiguration ----------------------------------------------------

    /// Raising a limit must not retroactively forgive consumption that already
    /// happened, and lowering one must take effect immediately.
    function test_loweringLimitClampsAvailableImmediately() public {
        vm.prank(limitManager);
        limiter.setLimits(ROUTE, 100e6, 200e6, 400e6);

        (uint256 hourly, uint256 daily) = limiter.windowsOf(ROUTE);
        assertLe(hourly, 200e6, "hourly not clamped to the new limit");
        assertLe(daily, 400e6, "daily not clamped to the new limit");
    }

    function test_raisingLimitDoesNotRefillInstantly() public {
        vm.startPrank(consumer);
        for (uint256 i = 0; i < HOURLY / PER_TX; i++) {
            limiter.consume(ROUTE, PER_TX);
        }
        vm.stopPrank();

        vm.prank(limitManager);
        limiter.setLimits(ROUTE, PER_TX, HOURLY * 10, DAILY * 10);

        (uint256 hourly,) = limiter.windowsOf(ROUTE);
        assertEq(hourly, 0, "raising the cap must not credit an exhausted bucket");
    }

    // -- route independence -------------------------------------------------

    function test_routesHaveIndependentBuckets() public {
        vm.prank(limitManager);
        limiter.setLimits(OTHER_ROUTE, PER_TX, HOURLY, DAILY);

        vm.startPrank(consumer);
        for (uint256 i = 0; i < HOURLY / PER_TX; i++) {
            limiter.consume(ROUTE, PER_TX);
        }
        vm.stopPrank();

        (uint256 exhausted,) = limiter.windowsOf(ROUTE);
        (uint256 untouched,) = limiter.windowsOf(OTHER_ROUTE);

        assertEq(exhausted, 0);
        assertEq(untouched, HOURLY, "draining one direction must not throttle the other");
    }

    // -- available() --------------------------------------------------------

    /// The UI reads `available()`. If it reported only the daily figure a user
    /// could reach wallet confirmation on a transfer the hourly bucket rejects.
    function test_availableRespectsTheTightestConstraint() public view {
        assertEq(limiter.available(ROUTE), PER_TX, "per-transaction cap is tightest at rest");
    }

    function testFuzz_neverAdvertisesMoreThanItAccepts(uint256 amount) public {
        amount = bound(amount, 1, DAILY);
        uint256 advertised = limiter.available(ROUTE);

        if (amount <= advertised) {
            vm.prank(consumer);
            limiter.consume(ROUTE, amount); // must not revert
        }
    }
}
