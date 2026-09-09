// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IArkBridgePauseController} from "../../src/interfaces/IArkBridgePauseController.sol";
import {ArkBridgePauseController} from "../../src/security/ArkBridgePauseController.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Test} from "forge-std/Test.sol";

contract ArkBridgePauseControllerTest is Test {
    ArkBridgePauseController internal pauser;

    address internal admin = makeAddr("admin");
    address internal guard = makeAddr("guard");
    address internal unguard = makeAddr("unguard");
    address internal stranger = makeAddr("stranger");

    uint32 internal constant SEPOLIA = 11155111;
    uint32 internal constant ARK = 9000;
    uint32 internal constant BSC = 97;

    bytes32 internal constant USDC = keccak256("sepolia-mockusdc");
    bytes32 internal constant USDT = keccak256("sepolia-mockusdt");

    bytes32 internal constant SEPOLIA_TO_ARK = keccak256("sepolia:ark:usdc");
    bytes32 internal constant ARK_TO_SEPOLIA = keccak256("ark:sepolia:usdc");
    bytes32 internal constant BSC_TO_ARK = keccak256("bsc:ark:usdc");

    function setUp() public {
        pauser = new ArkBridgePauseController(admin);
        vm.startPrank(admin);
        pauser.grantRole(pauser.PAUSER_ROLE(), guard);
        pauser.grantRole(pauser.UNPAUSER_ROLE(), unguard);
        vm.stopPrank();
    }

    // -- INV-03: a paused route rejects new transfers -----------------------

    function test_INV03_pausedRouteRejects() public {
        vm.prank(guard);
        pauser.pauseRoute(SEPOLIA_TO_ARK, "incident");

        vm.expectRevert(
            abi.encodeWithSelector(
                IArkBridgePauseController.TransferPaused.selector, IArkBridgePauseController.Scope.Route, SEPOLIA_TO_ARK
            )
        );
        pauser.assertNotPaused(SEPOLIA_TO_ARK, USDC, SEPOLIA, ARK);
    }

    /// Pausing one directed route must not pause its reverse. During an incident
    /// the direction users most need is usually *out*.
    function test_pausingOneDirectionLeavesTheOtherOpen() public {
        vm.prank(guard);
        pauser.pauseRoute(SEPOLIA_TO_ARK, "inbound only");

        assertTrue(pauser.isPaused(SEPOLIA_TO_ARK, USDC, SEPOLIA, ARK));
        assertFalse(pauser.isPaused(ARK_TO_SEPOLIA, USDC, ARK, SEPOLIA), "reverse route was collaterally paused");
        pauser.assertNotPaused(ARK_TO_SEPOLIA, USDC, ARK, SEPOLIA);
    }

    /// Spec section 89: pausing Ethereum -> Ark USDC must not pause BNB -> Ark USDC.
    function test_pausingOneRouteLeavesOtherChainsRouteOpen() public {
        vm.prank(guard);
        pauser.pauseRoute(SEPOLIA_TO_ARK, "sepolia only");

        assertFalse(pauser.isPaused(BSC_TO_ARK, USDC, BSC, ARK), "an unrelated chain's route was paused");
    }

    function test_pausingOneTokenLeavesOthersOpen() public {
        vm.prank(guard);
        pauser.pauseToken(USDC, "asset under review");

        assertTrue(pauser.isPaused(SEPOLIA_TO_ARK, USDC, SEPOLIA, ARK));
        assertFalse(pauser.isPaused(SEPOLIA_TO_ARK, USDT, SEPOLIA, ARK), "an unrelated asset was paused");
    }

    /// A chain that cannot be trusted as a source cannot be trusted as a
    /// destination either — sending assets onto a halted chain strands them.
    function test_pausingAChainStopsTransfersBothToAndFromIt() public {
        vm.prank(guard);
        pauser.pauseChain(SEPOLIA, "reorg");

        assertTrue(pauser.isPaused(SEPOLIA_TO_ARK, USDC, SEPOLIA, ARK), "transfers from the chain still allowed");
        assertTrue(pauser.isPaused(ARK_TO_SEPOLIA, USDC, ARK, SEPOLIA), "transfers to the chain still allowed");
        assertFalse(pauser.isPaused(BSC_TO_ARK, USDC, BSC, ARK), "an unrelated chain was affected");
    }

    function test_globalPauseStopsEverything() public {
        vm.prank(guard);
        pauser.pauseGlobal("emergency");

        assertTrue(pauser.isPaused(SEPOLIA_TO_ARK, USDC, SEPOLIA, ARK));
        assertTrue(pauser.isPaused(ARK_TO_SEPOLIA, USDT, ARK, SEPOLIA));
        assertTrue(pauser.isPaused(BSC_TO_ARK, USDC, BSC, ARK));
    }

    /// The narrowest applicable scope is reported so the UI can say which route
    /// is unavailable rather than "something went wrong".
    function test_reportsTheNarrowestPausedScope() public {
        vm.startPrank(guard);
        pauser.pauseChain(SEPOLIA, "chain");
        pauser.pauseRoute(SEPOLIA_TO_ARK, "route");
        vm.stopPrank();

        vm.expectRevert(
            abi.encodeWithSelector(
                IArkBridgePauseController.TransferPaused.selector, IArkBridgePauseController.Scope.Route, SEPOLIA_TO_ARK
            )
        );
        pauser.assertNotPaused(SEPOLIA_TO_ARK, USDC, SEPOLIA, ARK);
    }

    // -- roles --------------------------------------------------------------

    /// Pausing and unpausing are separate authorities: being able to hit stop
    /// should not imply being able to decide the danger has passed.
    function test_pauserCannotUnpause() public {
        vm.prank(guard);
        pauser.pauseGlobal("emergency");

        bytes32 role = pauser.UNPAUSER_ROLE();
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, guard, role));
        vm.prank(guard);
        pauser.unpauseGlobal();

        assertTrue(pauser.globalPaused(), "pause was lifted by an account without UNPAUSER_ROLE");
    }

    function test_unpauserCannotPause() public {
        bytes32 role = pauser.PAUSER_ROLE();
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, unguard, role));
        vm.prank(unguard);
        pauser.pauseGlobal("nope");
    }

    function test_INV04_strangerCannotPause() public {
        bytes32 role = pauser.PAUSER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        pauser.pauseRoute(SEPOLIA_TO_ARK, "unauthorised");
    }

    function test_unpauseRestoresTransfers() public {
        vm.prank(guard);
        pauser.pauseRoute(SEPOLIA_TO_ARK, "incident");
        vm.prank(unguard);
        pauser.unpauseRoute(SEPOLIA_TO_ARK);

        pauser.assertNotPaused(SEPOLIA_TO_ARK, USDC, SEPOLIA, ARK);
    }

    function test_doublePauseReverts() public {
        vm.startPrank(guard);
        pauser.pauseRoute(SEPOLIA_TO_ARK, "first");
        vm.expectRevert(
            abi.encodeWithSelector(
                IArkBridgePauseController.AlreadyPaused.selector, IArkBridgePauseController.Scope.Route, SEPOLIA_TO_ARK
            )
        );
        pauser.pauseRoute(SEPOLIA_TO_ARK, "second");
        vm.stopPrank();
    }

    /// Whatever combination of scopes is paused, `isPaused` and
    /// `assertNotPaused` must agree. A divergence would mean one entry point
    /// permits what the other forbids, which is INV-12.
    function testFuzz_INV12_predicateAndAssertionAgree(
        bool global,
        bool chain,
        bool token,
        bool route,
        uint32 origin,
        uint32 destination
    ) public {
        origin = uint32(bound(origin, 1, 1_000_000));
        destination = uint32(bound(destination, 1_000_001, 2_000_000));

        vm.startPrank(guard);
        if (global) pauser.pauseGlobal("g");
        if (chain) pauser.pauseChain(origin, "c");
        if (token) pauser.pauseToken(USDC, "t");
        if (route) pauser.pauseRoute(SEPOLIA_TO_ARK, "r");
        vm.stopPrank();

        bool predicate = pauser.isPaused(SEPOLIA_TO_ARK, USDC, origin, destination);
        bool asserted;
        try pauser.assertNotPaused(SEPOLIA_TO_ARK, USDC, origin, destination) {
            asserted = false;
        } catch {
            asserted = true;
        }

        assertEq(predicate, asserted, "isPaused and assertNotPaused disagree");
        assertEq(predicate, global || chain || token || route, "unexpected pause state");
    }
}
