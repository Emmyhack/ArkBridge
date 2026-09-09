// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "./MockERC20.sol";

/// @notice Test stand-in for USDT. Six decimals.
contract MockUSDT is MockERC20 {
    constructor(address owner_) MockERC20("Mock Tether USD", "MockUSDT", 6, owner_) {}
}
