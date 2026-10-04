// SPDX-License-Identifier: MIT
#pragma once
#include "ViewAPI.h"
#include <cstdint>
#include <cstring>
namespace Meridian::UI::KeyboardMovement {
inline constexpr char EXTENSION_NAME[] = "Aetherius.KeyboardMovement";
inline constexpr std::uint32_t INTERFACE_VERSION = 1;
using OpenCallback = bool(__cdecl*)(void*);
// Local input only. Configure before claiming focus. The callback runs on the
// game thread outside platform locks; false preserves the vanilla opener.
class IKeyboardMovementAPI {
public:
    virtual ~IKeyboardMovementAPI() = default;
    virtual bool __cdecl Configure(View::ViewHandle view, bool enabled, OpenCallback opener, void* context) = 0;
};
inline bool IsSupported(const char* name, std::uint32_t version) {
    return name && std::strcmp(name, EXTENSION_NAME) == 0 && version == INTERFACE_VERSION;
}
}
