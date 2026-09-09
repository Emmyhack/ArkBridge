// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "./MockERC20.sol";

/// @notice Test stand-in for USDC. Six decimals, matching the real issuance, so
///         that the first end-to-end route exercises a non-18-decimal asset.
contract MockUSDC is MockERC20 {
    constructor(address owner_) MockERC20("Mock USD Coin", "MockUSDC", 6, owner_) {}
}
