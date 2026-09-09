// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Test-only ERC20 with configurable decimals and open minting.
/// @dev Decimals are constructor-supplied so bridge routes can be exercised at
///      6, 8 and 18 decimals rather than only the 18 that most tokens use.
///
///      Every mock exposes `IS_ARKBRIDGE_MOCK`. Deployment tooling reads that
///      marker to refuse a production deployment that references a mock asset,
///      which is a stronger guarantee than matching on contract names.
contract MockERC20 is ERC20, Ownable {
    /// @notice Marker read by deployment tooling to reject mocks in production.
    bool public constant IS_ARKBRIDGE_MOCK = true;

    uint8 private immutable _decimals;

    /// @notice Per-address cap on a single faucet call. Zero disables the faucet.
    uint256 public faucetLimit;

    /// @notice Largest decimals value a mock will accept.
    /// @dev Bounded so the default faucet limit cannot overflow, and so a mock
    ///      can never be configured outside the range the registry validates.
    uint8 public constant MAX_DECIMALS = 36;

    error FaucetDisabled();
    error FaucetLimitExceeded(uint256 requested, uint256 limit);
    error UnsupportedDecimals(uint8 decimals);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        if (decimals_ > MAX_DECIMALS) revert UnsupportedDecimals(decimals_);
        _decimals = decimals_;
        faucetLimit = 1_000_000 * (10 ** uint256(decimals_));
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint to any address. Owner only.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Burn from the caller.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /// @notice Self-serve testnet faucet, capped per call.
    function faucet(uint256 amount) external {
        uint256 limit = faucetLimit;
        if (limit == 0) revert FaucetDisabled();
        if (amount > limit) revert FaucetLimitExceeded(amount, limit);
        _mint(msg.sender, amount);
    }

    function setFaucetLimit(uint256 newLimit) external onlyOwner {
        faucetLimit = newLimit;
    }
}
