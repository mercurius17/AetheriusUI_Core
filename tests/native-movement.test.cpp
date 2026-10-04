#include "Common/KeyboardMovementPolicy.h"
#include <cstdlib>
using Meridian::Common::PassMovementKey;
int main() {
    // W mapped to movement: held input passes, typing consumes its down event,
    // but key-up reaches the engine so a pre-existing press cannot stay stuck.
    if (!PassMovementKey(true, false, true, false, 0x11)) return EXIT_FAILURE;
    if (PassMovementKey(true, true, true, false, 0x11)) return EXIT_FAILURE;
    if (!PassMovementKey(true, true, true, true, 0x11)) return EXIT_FAILURE;
    // Remapped E collides with a reserved UI action; UI keeps ownership.
    if (PassMovementKey(true, false, true, false, 0x12)) return EXIT_FAILURE;
    // Attack, arbitrary hotkeys, and unrelated focus owners never pass here.
    if (PassMovementKey(true, false, false, false, 0x02)) return EXIT_FAILURE;
    if (PassMovementKey(false, false, true, false, 0x11)) return EXIT_FAILURE;
    return EXIT_SUCCESS;
}
