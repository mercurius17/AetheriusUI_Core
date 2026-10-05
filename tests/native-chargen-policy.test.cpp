#include "chargen-policy.h"
#include <cstdlib>
#include <initializer_list>
int main() {
    using Aetherius::Chargen::IsPresentationCommand;
    for (const auto command : {"snapshot", "camera", "returnToVanilla"})
        if (!IsPresentationCommand(command)) return EXIT_FAILURE;
    for (const auto command : {"race", "slider", "finish", "sex", "name", "commit", "", "Camera", "camera/finish"})
        if (IsPresentationCommand(command)) return EXIT_FAILURE;
    return EXIT_SUCCESS;
}
