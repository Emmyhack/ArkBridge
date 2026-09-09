// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ArkBridgeGuard} from "../../src/security/ArkBridgeGuard.sol";
import {ArkBridgePauseController} from "../../src/security/ArkBridgePauseController.sol";
import {ArkBridgeRateLimiter} from "../../src/security/ArkBridgeRateLimiter.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Drives the guard through arbitrary sequences of transfers, time
///         jumps and pauses, recording what actually got through.
contract GuardHandler is Test {
    ArkBridgeGuard public immutable GUARD;
    ArkBridgeRateLimiter public immutable LIMITER;
    ArkBridgePauseController public immutable PAUSER;

    bytes32 public constant ROUTE = keccak256("sepolia:ark:usdc");
    bytes32 public constant TOKEN = keccak256("sepolia-mockusdc");
    uint32 public constant ORIGIN = 11155111;

    address public immutable ROUTER;
    address public immutable PAUSER_ACCT;
    address public immutable UNPAUSER_ACCT;

    uint256 public totalMoved;
    uint256 public startTime;
    bool public paused;

    constructor(
        ArkBridgeGuard guard_,
        ArkBridgeRateLimiter limiter_,
        ArkBridgePauseController pauser_,
        address router_,
        address pauserAcct_,
        address unpauserAcct_
    ) {
        GUARD = guard_;
        LIMITER = limiter_;
        PAUSER = pauser_;
        ROUTER = router_;
        PAUSER_ACCT = pauserAcct_;
        UNPAUSER_ACCT = unpauserAcct_;
        startTime = block.timestamp;
    }

    function transfer(uint256 amount) external {
        amount = bound(amount, 1, 2_000e6);
        vm.prank(ROUTER);
        try GUARD.authorizeTransfer(ROUTE, TOKEN, ORIGIN, amount) {
            totalMoved += amount;
        } catch {
            // Rejected: over a limit, or paused. Either way nothing moved.
        }
    }

    /// Splitting is the attack this invariant exists to rule out.
    function transferSplit(uint256 amount, uint8 pieces) external {
        amount = bound(amount, 1, 1_000e6);
        pieces = uint8(bound(pieces, 2, 10));
        uint256 chunk = amount / pieces;
        if (chunk == 0) return;

        for (uint256 i = 0; i < pieces; i++) {
            vm.prank(ROUTER);
            try GUARD.authorizeTransfer(ROUTE, TOKEN, ORIGIN, chunk) {
                totalMoved += chunk;
            } catch {
                return;
            }
        }
    }

    function warp(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1, 6 hours));
    }

    function pause() external {
        if (paused) return;
        vm.prank(PAUSER_ACCT);
        PAUSER.pauseRoute(ROUTE, "fuzz");
        paused = true;
    }

    function unpause() external {
        if (!paused) return;
        vm.prank(UNPAUSER_ACCT);
        PAUSER.unpauseRoute(ROUTE);
        paused = false;
    }

    function elapsed() external view returns (uint256) {
        return block.timestamp - startTime;
    }
}

/// @title RateLimitInvariant
/// @notice INV-11 as a stateful property rather than a scripted case.
///
/// @dev The scripted tests check specific splitting patterns. This one lets the
///      fuzzer choose the pattern — sizes, counts, time jumps, and pauses
///      interleaved arbitrarily — and asserts the bound survives all of them.
///      That is the difference between "the splits I thought of are handled" and
///      "splitting does not help".
contract RateLimitInvariant is Test {
    GuardHandler internal handler;
    ArkBridgeRateLimiter internal limiter;

    uint256 internal constant PER_TX = 1_000e6;
    uint256 internal constant HOURLY = 5_000e6;
    uint256 internal constant DAILY = 20_000e6;

    function setUp() public {
        address admin = makeAddr("admin");
        address config = makeAddr("config");
        address router = makeAddr("router");
        address pauserAcct = makeAddr("pauserAcct");
        address unpauserAcct = makeAddr("unpauserAcct");

        limiter = new ArkBridgeRateLimiter(admin);
        ArkBridgePauseController pauser = new ArkBridgePauseController(admin);
        ArkBridgeGuard guard = new ArkBridgeGuard(admin, limiter, pauser);

        vm.startPrank(admin);
        limiter.grantRole(limiter.LIMIT_MANAGER_ROLE(), config);
        limiter.grantRole(limiter.CONFIG_ADMIN_ROLE(), address(guard));
        pauser.grantRole(pauser.PAUSER_ROLE(), pauserAcct);
        pauser.grantRole(pauser.UNPAUSER_ROLE(), unpauserAcct);
        guard.grantRole(guard.CONFIG_ADMIN_ROLE(), config);
        vm.stopPrank();

        bytes32 route = keccak256("sepolia:ark:usdc");
        bytes32 token = keccak256("sepolia-mockusdc");

        vm.startPrank(config);
        limiter.setLimits(route, PER_TX, HOURLY, DAILY);
        guard.registerToken(token);
        guard.registerRoute(route, 11155111, 9000, token);
        guard.setAuthorizedCaller(router, true);
        vm.stopPrank();

        handler = new GuardHandler(guard, limiter, pauser, router, pauserAcct, unpauserAcct);
        targetContract(address(handler));
    }

    /// INV-11: however the fuzzer splits transfers and however time advances,
    /// the total moved cannot exceed the daily capacity plus what legitimately
    /// refilled over the elapsed span.
    function invariant_INV11_aggregateLimitSurvivesSplitting() public view {
        uint256 elapsed = handler.elapsed();
        uint256 permitted = DAILY + (DAILY * elapsed) / 1 days;
        assertLe(handler.totalMoved(), permitted, "aggregate limit was bypassed");
    }

    /// The hourly window is the tighter of the two and must bind on its own
    /// terms: nothing can move more than the hourly capacity plus its refill.
    function invariant_INV11_hourlyWindowAlsoBinds() public view {
        uint256 elapsed = handler.elapsed();
        uint256 permitted = HOURLY + (HOURLY * elapsed) / 1 hours;
        assertLe(handler.totalMoved(), permitted, "hourly window was bypassed");
    }

    /// A bucket must never report more than its configured capacity, whatever
    /// sequence of consumption and refill produced it.
    function invariant_bucketsNeverExceedCapacity() public view {
        (uint256 hourly, uint256 daily) = limiter.windowsOf(keccak256("sepolia:ark:usdc"));
        assertLe(hourly, HOURLY, "hourly bucket overfilled");
        assertLe(daily, DAILY, "daily bucket overfilled");
    }

    /// Advertised capacity must never exceed what the tightest limit allows.
    function invariant_availableNeverExceedsPerTransactionCap() public view {
        assertLe(limiter.available(keccak256("sepolia:ark:usdc")), PER_TX);
    }
}
