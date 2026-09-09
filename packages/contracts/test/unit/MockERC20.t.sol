// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockUSDT} from "../../src/mocks/MockUSDT.sol";
import {MockWETH} from "../../src/mocks/MockWETH.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

contract MockERC20Test is Test {
    MockERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new MockERC20("Mock Token", "MOCK", 6, owner);
    }

    // -- identity -----------------------------------------------------------

    /// The mock marker is what production deployment tooling keys off, so it
    /// must be present and true on every mock asset.
    function test_exposesMockMarker() public view {
        assertTrue(token.IS_ARKBRIDGE_MOCK());
    }

    function test_reportsConstructorDecimals() public view {
        assertEq(token.decimals(), 6);
    }

    /// Decimals are not assumed to be 18 anywhere. Each preset asset must
    /// report the decimals its real counterpart uses.
    function test_presetAssetsUseTheirRealDecimals() public {
        assertEq(new MockUSDC(owner).decimals(), 6, "MockUSDC");
        assertEq(new MockUSDT(owner).decimals(), 6, "MockUSDT");
        assertEq(new MockWETH(owner).decimals(), 18, "MockWETH");
    }

    /// The registry treats decimals as free-form within a plausible range;
    /// the token must too.
    function testFuzz_supportsAnyPlausibleDecimals(uint8 decimals_) public {
        decimals_ = uint8(bound(decimals_, 0, token.MAX_DECIMALS()));
        MockERC20 t = new MockERC20("D", "D", decimals_, owner);
        assertEq(t.decimals(), decimals_);
    }

    /// Regression: the default faucet limit is `1_000_000 * 10**decimals`,
    /// which overflows uint256 well before uint8 runs out. Rather than let the
    /// constructor panic on an implausible value, reject it explicitly.
    function testFuzz_rejectsImplausibleDecimals(uint8 decimals_) public {
        decimals_ = uint8(bound(decimals_, token.MAX_DECIMALS() + 1, type(uint8).max));
        vm.expectRevert(abi.encodeWithSelector(MockERC20.UnsupportedDecimals.selector, decimals_));
        new MockERC20("D", "D", decimals_, owner);
    }

    // -- minting ------------------------------------------------------------

    function test_ownerCanMint() public {
        vm.prank(owner);
        token.mint(alice, 1_000e6);
        assertEq(token.balanceOf(alice), 1_000e6);
        assertEq(token.totalSupply(), 1_000e6);
    }

    function test_nonOwnerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1);
    }

    function test_burnReducesSupply() public {
        vm.prank(owner);
        token.mint(alice, 500e6);

        vm.prank(alice);
        token.burn(200e6);

        assertEq(token.balanceOf(alice), 300e6);
        assertEq(token.totalSupply(), 300e6);
    }

    // -- faucet -------------------------------------------------------------

    function test_faucetMintsUpToTheLimit() public {
        uint256 limit = token.faucetLimit();

        vm.prank(alice);
        token.faucet(limit);

        assertEq(token.balanceOf(alice), limit);
    }

    function test_faucetRejectsAboveTheLimit() public {
        uint256 limit = token.faucetLimit();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockERC20.FaucetLimitExceeded.selector, limit + 1, limit));
        token.faucet(limit + 1);
    }

    function test_faucetCanBeDisabled() public {
        vm.prank(owner);
        token.setFaucetLimit(0);

        vm.prank(bob);
        vm.expectRevert(MockERC20.FaucetDisabled.selector);
        token.faucet(1);
    }

    function test_nonOwnerCannotChangeFaucetLimit() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.setFaucetLimit(1);
    }

    /// The faucet is per-call capped, not per-address capped. That is
    /// deliberate for a testnet asset, and asserting it here keeps the
    /// behaviour from being mistaken for a supply guarantee.
    function testFuzz_faucetIsCappedPerCallNotPerAddress(uint8 calls) public {
        calls = uint8(bound(calls, 1, 20));
        uint256 limit = token.faucetLimit();

        for (uint256 i = 0; i < calls; i++) {
            vm.prank(alice);
            token.faucet(limit);
        }

        assertEq(token.balanceOf(alice), limit * calls);
    }

    // -- transfers ----------------------------------------------------------

    function testFuzz_transferMovesExactAmount(uint256 amount) public {
        amount = bound(amount, 0, type(uint128).max);

        vm.prank(owner);
        token.mint(alice, amount);

        vm.prank(alice);
        assertTrue(token.transfer(bob, amount), "transfer did not return true");

        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(bob), amount);
    }

    /// No fee on transfer, no rebasing. The bridge's collateral accounting
    /// assumes the amount received equals the amount sent; this pins that the
    /// test assets actually behave that way.
    function testFuzz_transferIsLossless(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);

        vm.prank(owner);
        token.mint(alice, amount);

        uint256 supplyBefore = token.totalSupply();

        vm.prank(alice);
        assertTrue(token.transfer(bob, amount), "transfer did not return true");

        assertEq(token.totalSupply(), supplyBefore, "supply changed on transfer");
        assertEq(token.balanceOf(bob), amount, "recipient received a different amount");
    }
}
