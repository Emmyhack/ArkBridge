// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IArkBridgeRateLimiter} from "../interfaces/IArkBridgeRateLimiter.sol";
import {ArkBridgeRoles} from "./ArkBridgeRoles.sol";

/// @title ArkBridgeRateLimiter
/// @notice Per-route transfer limits: one cap per transaction, plus hourly and
///         daily aggregates that a caller cannot escape by splitting a transfer.
///
/// @dev WHY TOKEN BUCKETS, NOT FIXED WINDOWS
///
///      A fixed window ("at most X per calendar hour") lets an attacker move 2X
///      across a boundary: X at 10:59, X at 11:00. That defeats the point of
///      having an hourly limit at all, and it is the most common way this
///      control is built wrong.
///
///      Instead each window is a bucket of capacity `max`, refilling linearly at
///      `max / period` per second. Draining is instant, refilling is not, so
///      across any rolling window of `period` seconds a route can move at most
///      `max` — the split does not help, which is INV-11.
///
///      Both the hourly and daily buckets must admit a transfer. The daily
///      bucket is the binding constraint over a day; the hourly one shapes how
///      fast that daily allowance can be drawn down, which is what buys human
///      reaction time during an incident.
///
///      Limits are per directed route. `ethereum -> ark` and `ark -> ethereum`
///      are different routeIds with independent buckets, because inbound and
///      outbound risk are not the same and throttling one must not throttle the
///      other.
contract ArkBridgeRateLimiter is ArkBridgeRoles, IArkBridgeRateLimiter {
    uint256 private constant HOUR = 1 hours;
    uint256 private constant DAY = 1 days;

    struct Bucket {
        // Tokens currently available. Capped at the configured max.
        uint256 available;
        // Last time `available` was brought up to date.
        uint48 updatedAt;
    }

    mapping(bytes32 routeId => RouteLimits) private _limits;
    mapping(bytes32 routeId => Bucket) private _hourly;
    mapping(bytes32 routeId => Bucket) private _daily;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -- configuration ------------------------------------------------------

    /// @inheritdoc IArkBridgeRateLimiter
    /// @dev Setting limits starts both buckets full. That is deliberate: a route
    ///      being configured for the first time should not be throttled by a
    ///      history it does not have. Re-configuring an existing route does NOT
    ///      refill it — see below — so raising a limit cannot be used to wash
    ///      away consumption that already happened.
    function setLimits(bytes32 routeId, uint256 maxPerTransaction, uint256 maxHourly, uint256 maxDaily)
        external
        override
        onlyRole(LIMIT_MANAGER_ROLE)
    {
        if (
            maxPerTransaction == 0 || maxHourly == 0 || maxDaily == 0 || maxPerTransaction > maxHourly
                || maxHourly > maxDaily
        ) {
            revert InvalidLimits(maxPerTransaction, maxHourly, maxDaily);
        }

        RouteLimits storage existing = _limits[routeId];
        bool firstTime = existing.maxDaily == 0;

        _limits[routeId] = RouteLimits(maxPerTransaction, maxHourly, maxDaily);

        if (firstTime) {
            _hourly[routeId] = Bucket(maxHourly, uint48(block.timestamp));
            _daily[routeId] = Bucket(maxDaily, uint48(block.timestamp));
        } else {
            // Reconfiguring: settle both buckets at the OLD rate first, then
            // clamp to the new capacity. Without the settle, a limit change
            // would silently credit or destroy the elapsed refill. Without the
            // clamp, lowering a limit would leave more available than the new
            // limit allows.
            _settle(routeId);
            Bucket storage h = _hourly[routeId];
            Bucket storage d = _daily[routeId];
            if (h.available > maxHourly) h.available = maxHourly;
            if (d.available > maxDaily) d.available = maxDaily;
        }

        emit LimitsSet(routeId, maxPerTransaction, maxHourly, maxDaily);
    }

    // -- consumption --------------------------------------------------------

    /// @inheritdoc IArkBridgeRateLimiter
    function consume(bytes32 routeId, uint256 amount) external override onlyRole(CONFIG_ADMIN_ROLE) {
        RouteLimits memory limits = _limits[routeId];
        if (limits.maxDaily == 0) revert LimitsNotSet(routeId);

        if (amount > limits.maxPerTransaction) {
            revert ExceedsPerTransaction(routeId, amount, limits.maxPerTransaction);
        }

        _settle(routeId);

        Bucket storage h = _hourly[routeId];
        Bucket storage d = _daily[routeId];

        if (amount > h.available) revert ExceedsHourly(routeId, amount, h.available);
        if (amount > d.available) revert ExceedsDaily(routeId, amount, d.available);

        h.available -= amount;
        d.available -= amount;

        emit Consumed(routeId, amount, h.available, d.available);
    }

    // -- views --------------------------------------------------------------

    /// @inheritdoc IArkBridgeRateLimiter
    /// @notice The largest transfer this route would accept right now.
    /// @dev This is what the UI shows as remaining capacity, so it must account
    ///      for all three limits at once. Showing only the daily figure would
    ///      let a user reach wallet confirmation on a transfer the hourly bucket
    ///      is going to reject.
    function available(bytes32 routeId) public view override returns (uint256) {
        RouteLimits memory limits = _limits[routeId];
        if (limits.maxDaily == 0) return 0;

        uint256 h = _projected(_hourly[routeId], limits.maxHourly, HOUR);
        uint256 d = _projected(_daily[routeId], limits.maxDaily, DAY);

        uint256 result = limits.maxPerTransaction;
        if (h < result) result = h;
        if (d < result) result = d;
        return result;
    }

    function limitsOf(bytes32 routeId) external view override returns (RouteLimits memory) {
        return _limits[routeId];
    }

    /// @notice Remaining hourly and daily allowance, ignoring the per-transaction cap.
    function windowsOf(bytes32 routeId) external view returns (uint256 hourly, uint256 daily) {
        RouteLimits memory limits = _limits[routeId];
        if (limits.maxDaily == 0) return (0, 0);
        hourly = _projected(_hourly[routeId], limits.maxHourly, HOUR);
        daily = _projected(_daily[routeId], limits.maxDaily, DAY);
    }

    // -- internal -----------------------------------------------------------

    function _settle(bytes32 routeId) private {
        RouteLimits memory limits = _limits[routeId];
        Bucket storage h = _hourly[routeId];
        Bucket storage d = _daily[routeId];

        h.available = _projected(h, limits.maxHourly, HOUR);
        h.updatedAt = uint48(block.timestamp);

        d.available = _projected(d, limits.maxDaily, DAY);
        d.updatedAt = uint48(block.timestamp);
    }

    /// @dev Bucket contents as of now, without writing. Refill is
    ///      `capacity * elapsed / period`, clamped at `capacity`.
    ///
    ///      Multiplying before dividing keeps the refill exact for small
    ///      elapsed times; doing it the other way rounds the rate to zero for
    ///      any capacity below `period`, which would silently freeze low-value
    ///      routes forever.
    function _projected(Bucket storage bucket, uint256 capacity, uint256 period) private view returns (uint256) {
        uint256 current = bucket.available;
        if (current >= capacity) return capacity;

        uint256 elapsed = block.timestamp - bucket.updatedAt;
        if (elapsed == 0) return current;

        // Refilling a full period always restores full capacity, without
        // overflowing on an implausibly large elapsed time.
        if (elapsed >= period) return capacity;

        uint256 refilled = current + (capacity * elapsed) / period;
        return refilled > capacity ? capacity : refilled;
    }
}
