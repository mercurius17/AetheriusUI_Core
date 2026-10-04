#pragma once
#include <cstdint>
namespace Meridian::Common {
// Scan codes reserved by Core actions take precedence over remapped movement.
constexpr bool IsCoreReservedKey(std::uint32_t key) {
    return key == 0x01 || key == 0x0F || key == 0x12 || key == 0x13 || key == 0x14 || key == 0x21;
}
constexpr bool PassMovementKey(bool movementOwner, bool textInput, bool mappedMovement, bool release, std::uint32_t key) {
    return movementOwner && mappedMovement && !IsCoreReservedKey(key) && (!textInput || release);
}
}
