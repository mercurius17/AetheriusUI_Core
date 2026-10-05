#pragma once
#include <string_view>
namespace Aetherius::Chargen {
    constexpr bool IsPresentationCommand(std::string_view command) {
        return command == "snapshot" || command == "camera" || command == "returnToVanilla";
    }
}
