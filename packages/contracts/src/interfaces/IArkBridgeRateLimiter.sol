// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IArkBridgeRateLimiter {
    struct RouteLimits {
        uint256 maxPerTransaction;
        uint256 maxHourly;
        uint256 maxDaily;
    }

    event LimitsSet(bytes32 indexed routeId, uint256 maxPerTransaction, uint256 maxHourly, uint256 maxDaily);
    event Consumed(bytes32 indexed routeId, uint256 amount, uint256 hourlyRemaining, uint256 dailyRemaining);

    error LimitsNotSet(bytes32 routeId);
    error ExceedsPerTransaction(bytes32 routeId, uint256 amount, uint256 maxPerTransaction);
    error ExceedsHourly(bytes32 routeId, uint256 amount, uint256 available);
    error ExceedsDaily(bytes32 routeId, uint256 amount, uint256 available);
    error InvalidLimits(uint256 maxPerTransaction, uint256 maxHourly, uint256 maxDaily);

    function setLimits(bytes32 routeId, uint256 maxPerTransaction, uint256 maxHourly, uint256 maxDaily) external;
    function consume(bytes32 routeId, uint256 amount) external;
    function available(bytes32 routeId) external view returns (uint256);
    function limitsOf(bytes32 routeId) external view returns (RouteLimits memory);
}
