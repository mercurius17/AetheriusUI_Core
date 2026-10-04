#pragma once
#include "KeyboardMovementAPI.h"
#include "ViewDllLoader.h"
namespace Meridian::UI::KeyboardMovement {
inline IKeyboardMovementAPI* Query(Settings* settings, const char* consumer) {
    const auto module = GetModuleHandleW(L"MeridianUI.dll");
    if (!module) return nullptr;
    const auto query = reinterpret_cast<View::QueryMeridianExtensionFn>(GetProcAddress(module, "QueryMeridianExtension"));
    void* result = nullptr;
    return query && query(EXTENSION_NAME, INTERFACE_VERSION, &result, settings, consumer) ? static_cast<IKeyboardMovementAPI*>(result) : nullptr;
}
}
