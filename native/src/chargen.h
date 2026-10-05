#pragma once

#include "MeridianUIAPI/ViewAPI.h"
#include "MeridianUIAPI/InputAPI.h"

namespace Aetherius::Chargen
{
    void CreateView(Meridian::UI::View::IViewAPI* views, Meridian::UI::Input::IInputAPI* input);
    bool IsActive();
    void Open();
    void Close(bool menuClosing = false);
    void OnMessageBoxOpened();
    void OnMessageBoxClosed();
    void InstallCameraHook();
}
