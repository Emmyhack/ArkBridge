// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {Test} from "forge-std/Test.sol";

/// @title REG_001 — MockERC20 constructor overflowed on large decimals
///
/// @notice WHAT WAS WRONG
///
/// `MockERC20`'s constructor set the default faucet limit to
/// `1_000_000 * (10 ** decimals_)`. `decimals_` is a `uint8`, so it can reach
/// 255, but `10 ** 72` already exceeds `type(uint256).max / 1_000_000`. Any
/// decimals value above roughly 72 made the constructor panic with an
/// arithmetic overflow (0x11) rather than fail meaningfully.
///
/// Found by the fuzzer on `testFuzz_supportsAnyDecimals`, not by review.
///
/// WHY IT MATTERED
///
/// On its own this was a test-asset bug. It is kept because the shape recurs:
/// an unchecked `10 ** n` where `n` comes from a token's own `decimals()`. The
/// bridge reads `decimals()` from ERC20s it does not control, and the token
/// policy explicitly admits assets with unusual decimals. The same expression
/// in a decimal-conversion path would be a live overflow on a hostile token.
///
/// THE FIX
///
/// Bound decimals at `MAX_DECIMALS = 36` and reject anything above it with an
/// explicit `UnsupportedDecimals` error, so an implausible value fails loudly at
/// construction instead of panicking.
contract REG_001_MockDecimalsOverflow is Test {
    address internal owner = makeAddr("owner");

    /// The exact counterexample the fuzzer produced.
    function test_REG001_originalCounterexample() public {
        vm.expectRevert(abi.encodeWithSelector(MockERC20.UnsupportedDecimals.selector, uint8(146)));
        new MockERC20("D", "D", 146, owner);
    }

    /// The boundary: 36 is accepted, 37 is not.
    function test_REG001_boundaryIsExact() public {
        MockERC20 ok = new MockERC20("D", "D", 36, owner);
        assertEq(ok.decimals(), 36);
        assertEq(ok.faucetLimit(), 1_000_000 * (10 ** 36));

        vm.expectRevert(abi.encodeWithSelector(MockERC20.UnsupportedDecimals.selector, uint8(37)));
        new MockERC20("D", "D", 37, owner);
    }

    /// No value in the whole uint8 range may panic. A revert is a correct
    /// outcome; an arithmetic panic is not.
    function testFuzz_REG001_neverPanics(uint8 decimals_) public {
        if (decimals_ <= 36) {
            MockERC20 token = new MockERC20("D", "D", decimals_, owner);
            assertEq(token.decimals(), decimals_);
        } else {
            vm.expectRevert(abi.encodeWithSelector(MockERC20.UnsupportedDecimals.selector, decimals_));
            new MockERC20("D", "D", decimals_, owner);
        }
    }
}
