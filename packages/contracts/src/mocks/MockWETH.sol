// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "./MockERC20.sol";

/// @notice Test stand-in for WETH. Eighteen decimals, giving the 6->18 and
///         18->6 conversion paths a second asset to exercise against.
contract MockWETH is MockERC20 {
    constructor(address owner_) MockERC20("Mock Wrapped Ether", "MockWETH", 18, owner_) {}
}
