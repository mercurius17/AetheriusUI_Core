#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>
#include <spdlog/sinks/basic_file_sink.h>
#include <spdlog/spdlog.h>

#include "MeridianUIAPI/InputDllLoader.h"
#include "MeridianUIAPI/ViewDllLoader.h"
#include "chargen.h"

#include <memory>

namespace
{
    constexpr auto kPluginName = "AetheriusUIBridge";
    Meridian::UI::View::IViewAPI* views = nullptr;
    Meridian::UI::Input::IInputAPI* input = nullptr;

    void InitializeLogging()
    {
        if (auto directory = SKSE::log::log_directory()) {
            auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>((*directory / "AetheriusUIBridge.log").string(), true);
            auto logger = std::make_shared<spdlog::logger>(kPluginName, sink);
            logger->flush_on(spdlog::level::info);
            spdlog::set_default_logger(logger);
        }
    }

    class MenuSink final : public RE::BSTEventSink<RE::MenuOpenCloseEvent>
    {
    public:
        RE::BSEventNotifyControl ProcessEvent(const RE::MenuOpenCloseEvent* event,
                                              RE::BSTEventSource<RE::MenuOpenCloseEvent>*) override
        {
            if (!event)
                return RE::BSEventNotifyControl::kContinue;

            if (event->menuName == RE::RaceSexMenu::MENU_NAME) {
                SKSE::GetTaskInterface()->AddTask([opening = event->opening]() {
                    if (!opening) {
                        Aetherius::Chargen::Close(true);
                        return;
                    }
                    // Console commands can leave the console open below RaceSex Menu.
                    if (auto* ui = RE::UI::GetSingleton(); ui && ui->IsMenuOpen(RE::Console::MENU_NAME)) {
                        if (auto* queue = RE::UIMessageQueue::GetSingleton())
                            queue->AddMessage(RE::Console::MENU_NAME, RE::UI_MESSAGE_TYPE::kHide, nullptr);
                    }
                    Aetherius::Chargen::Open();
                });
            } else if (event->menuName == RE::Console::MENU_NAME && !event->opening) {
                SKSE::GetTaskInterface()->AddTask([]() {
                    if (auto* ui = RE::UI::GetSingleton(); ui && ui->IsMenuOpen(RE::RaceSexMenu::MENU_NAME))
                        Aetherius::Chargen::Open();
                });
            } else if (event->menuName == RE::MessageBoxMenu::MENU_NAME) {
                SKSE::GetTaskInterface()->AddTask([opening = event->opening]() {
                    if (opening)
                        Aetherius::Chargen::OnMessageBoxOpened();
                    else
                        Aetherius::Chargen::OnMessageBoxClosed();
                });
            }
            return RE::BSEventNotifyControl::kContinue;
        }
    } menuSink;

    constexpr SKSE::PluginVersionData MakePluginVersionData()
    {
        SKSE::PluginVersionData version{};
        version.pluginVersion = 1;
        version.PluginName(kPluginName);
        version.AuthorName("Aetherius RP");
        version.UsesAddressLibrary();
        version.UsesUpdatedStructs();
        return version;
    }
}

extern "C" __declspec(dllexport) constinit auto SKSEPlugin_Version = MakePluginVersionData();

extern "C" __declspec(dllexport) bool SKSEPlugin_Query(const SKSE::QueryInterface* skse, SKSE::PluginInfo* info)
{
    info->infoVersion = SKSE::PluginInfo::kVersion;
    info->name = kPluginName;
    info->version = 1;
    return !skse->IsEditor() && skse->RuntimeVersion() >= SKSE::RUNTIME_SSE_1_5_39;
}

SKSEPluginLoad(const SKSE::LoadInterface* skse)
{
    if (skse->IsEditor())
        return false;
    SKSE::Init(skse);
    InitializeLogging();
    Aetherius::Chargen::InstallCameraHook();

    return SKSE::GetMessagingInterface()->RegisterListener([](SKSE::MessagingInterface::Message* message) {
        if (message->type == SKSE::MessagingInterface::kInputLoaded) {
            Meridian::UI::Settings settings{};
            views = Meridian::UI::View::Query(&settings, kPluginName);
            input = Meridian::UI::Input::Query(&settings, kPluginName);
            spdlog::info("AetheriusUI: Meridian View/1={} Input/1={}", views != nullptr, input != nullptr);
        } else if (message->type == SKSE::MessagingInterface::kDataLoaded) {
            if (auto* ui = RE::UI::GetSingleton())
                ui->AddEventSink(&menuSink);
            Aetherius::Chargen::CreateView(views, input);
        } else if (message->type == SKSE::MessagingInterface::kPreLoadGame) {
            SKSE::GetTaskInterface()->AddTask([]() { Aetherius::Chargen::Close(); });
        }
    });
}
