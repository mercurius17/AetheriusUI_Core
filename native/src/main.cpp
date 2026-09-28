#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>
#include <nlohmann/json.hpp>
#include <spdlog/sinks/basic_file_sink.h>
#include <spdlog/spdlog.h>

#include "MeridianUIAPI/ViewDllLoader.h"
#include "MeridianUIAPI/InputDllLoader.h"

#include <memory>
#include <string>
#include <string_view>

namespace
{
    using json = nlohmann::json;
    constexpr auto kPluginName = "AetheriusUIBridge";
#ifdef AETHERIUS_UI_INCLUDE_FIXTURES
    constexpr auto kMainUrl = "mod://aetheriusui/index.html?fixtures";
#else
    constexpr auto kMainUrl = "mod://aetheriusui/index.html";
#endif
    constexpr auto kHudUrl = "mod://aetheriusui/hud.html";
    constexpr auto kMaxBridgeBytes = 18U * 1024U;
    constexpr auto kMainOwner = "aetheriusui";
    constexpr auto kHudOwner = "aetheriusui";

    Meridian::UI::View::IViewAPI* g_views = nullptr;
    Meridian::UI::Input::IInputAPI* g_input = nullptr;
    Meridian::UI::View::ViewHandle g_mainView = Meridian::UI::View::INVALID_VIEW_HANDLE;
    Meridian::UI::View::ViewHandle g_hudView = Meridian::UI::View::INVALID_VIEW_HANDLE;
    Meridian::UI::Input::ShortcutHandle g_openShortcut = 0;
    bool g_mainActive = false;

    void InitializeLogging()
    {
        if (auto directory = SKSE::log::log_directory()) {
            auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>((*directory / "AetheriusUIBridge.log").string(), true);
            auto logger = std::make_shared<spdlog::logger>(kPluginName, sink);
            logger->flush_on(spdlog::level::info);
            spdlog::set_default_logger(logger);
        }
    }

    std::string Base64(std::string_view input)
    {
        constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        std::string result;
        result.reserve(((input.size() + 2) / 3) * 4);
        for (std::size_t i = 0; i < input.size(); i += 3) {
            const auto a = static_cast<unsigned char>(input[i]);
            const auto b = i + 1 < input.size() ? static_cast<unsigned char>(input[i + 1]) : 0;
            const auto c = i + 2 < input.size() ? static_cast<unsigned char>(input[i + 2]) : 0;
            result.push_back(alphabet[a >> 2]);
            result.push_back(alphabet[((a & 3U) << 4) | (b >> 4)]);
            result.push_back(i + 1 < input.size() ? alphabet[((b & 15U) << 2) | (c >> 6)] : '=');
            result.push_back(i + 2 < input.size() ? alphabet[c & 63U] : '=');
        }
        return result;
    }

    bool CanOpenInCurrentGameState()
    {
        const auto ui = RE::UI::GetSingleton();
        const auto player = RE::PlayerCharacter::GetSingleton();
        if (!ui || !player || !player->Is3DLoaded() || ui->GameIsPaused())
            return false;
        for (const auto* menu : {"Console", "Main Menu", "Loading Menu", "Dialogue Menu", "RaceSex Menu", "Fader Menu"}) {
            if (ui->IsMenuOpen(menu))
                return false;
        }
        return true;
    }

    void SendModEvent(const char* name, const std::string& payload)
    {
        if (payload.size() > kMaxBridgeBytes || !SKSE::GetModCallbackEventSource())
            return;
        SKSE::ModCallbackEvent event{};
        event.eventName = name;
        event.strArg = payload.c_str();
        event.numArg = 0.0F;
        event.sender = nullptr;
        SKSE::GetModCallbackEventSource()->SendEvent(&event);
    }

    void NotifyFocus(bool focused)
    {
        SendModEvent("AetheriusUI.FocusState", focused ? "true" : "false");
    }

    void CloseMainView()
    {
        if (!g_views || g_mainView == Meridian::UI::View::INVALID_VIEW_HANDLE)
            return;
        const bool wasActive = g_mainActive;
        g_mainActive = false;
        if (g_views->HasFocus(g_mainView))
            g_views->Unfocus(g_mainView);
        g_views->ExecuteJavaScript(g_mainView, "window.AetheriusUI&&window.AetheriusUI.nativeFocusChanged(false);");
        g_views->Hide(g_mainView);
        if (wasActive)
            NotifyFocus(false);
    }

    void OpenMainView()
    {
        if (!g_views || g_mainView == Meridian::UI::View::INVALID_VIEW_HANDLE || !CanOpenInCurrentGameState())
            return;
        if (g_views->HasFocus(g_mainView))
            return;
        if (!g_views->IsReady(g_mainView)) {
            spdlog::warn("AetheriusUI: main view not ready; TAB opener ignored");
            return;
        }
        g_views->Show(g_mainView);
        const auto result = g_views->TryFocus(g_mainView, Meridian::UI::View::FocusMode::Unpaused);
        if (result == Meridian::UI::View::FocusResult::Granted || result == Meridian::UI::View::FocusResult::AlreadyFocused) {
            g_mainActive = true;
            g_views->ExecuteJavaScript(g_mainView, "window.AetheriusUI&&window.AetheriusUI.nativeFocusChanged(true);");
            NotifyFocus(true);
        } else {
            g_views->Hide(g_mainView);
            spdlog::warn("AetheriusUI: Meridian focus denied with result {}", static_cast<unsigned>(result));
        }
    }

    void __cdecl OnControllerOpen(Meridian::UI::Input::ShortcutHandle, void*)
    {
        SKSE::GetTaskInterface()->AddTask([]() {
            if (g_views && g_mainView != Meridian::UI::View::INVALID_VIEW_HANDLE && g_views->HasFocus(g_mainView)) {
                g_views->ExecuteJavaScript(g_mainView, "window.AetheriusUI&&window.AetheriusUI.nativeTab();");
            } else {
                OpenMainView();
            }
        });
    }

    void __cdecl OnSendEnvelope(const char* rawPayload)
    {
        if (!rawPayload)
            return;
        const std::string payload(rawPayload);
        if (payload.empty() || payload.size() > kMaxBridgeBytes)
            return;
        try {
            const auto parsed = json::parse(payload);
            if (!parsed.is_object() || parsed.value("protocolVersion", 0) != 1 ||
                !parsed.contains("kind") || parsed.value("kind", std::string{}) != "request")
                return;
            spdlog::info("AetheriusUI bridge accepted request {} {}", parsed.value("moduleId", std::string{}), parsed.value("correlationId", std::string{}).substr(0, 64));
        } catch (...) {
            return;
        }
        SKSE::GetTaskInterface()->AddTask([payload]() { SendModEvent("AetheriusUI.FromView", payload); });
    }

    void __cdecl OnSetFocus(const char* rawPayload)
    {
        if (!rawPayload)
            return;
        bool focused = false;
        try {
            focused = json::parse(rawPayload).get<bool>();
        } catch (...) {
            return;
        }
        SKSE::GetTaskInterface()->AddTask([focused]() {
            if (focused)
                OpenMainView();
            else
                CloseMainView();
        });
    }

    void DispatchToView(Meridian::UI::View::ViewHandle handle, const char* eventName, const std::string& packet)
    {
        if (!g_views || handle == Meridian::UI::View::INVALID_VIEW_HANDLE || packet.size() > kMaxBridgeBytes)
            return;
        const auto encoded = Base64(packet);
        const auto script = std::string("window.dispatchEvent(new CustomEvent('") + eventName + "',{detail:'" + encoded + "'}));";
        g_views->ExecuteJavaScript(handle, script.c_str());
    }

    void RouteClientPacket(std::string packet)
    {
        if (packet.empty() || packet.size() > kMaxBridgeBytes)
            return;
        json parsed;
        try {
            parsed = json::parse(packet);
        } catch (...) {
            return;
        }
        if (!parsed.is_object())
            return;

        const auto envelope = parsed.value("envelope", json::object());
        if (envelope.is_object() && envelope.value("moduleId", std::string{}) == "hud" &&
            (envelope.value("kind", std::string{}) == "snapshot" || envelope.value("kind", std::string{}) == "event")) {
            const auto hudPacket = json{{"type", "hud"}, {"source", "server"}, {"state", envelope.value("payload", json::object())}};
            DispatchToView(g_hudView, "aetherius-hud-state", hudPacket.dump());
            return;
        }

        if (parsed.value("type", std::string{}) == "hud" && parsed.value("source", std::string{}) == "server") {
            DispatchToView(g_hudView, "aetherius-hud-state", packet);
            return;
        }
        DispatchToView(g_mainView, "aetherius-ui-message", packet);
    }

    class ModEventSink final : public RE::BSTEventSink<SKSE::ModCallbackEvent>
    {
    public:
        RE::BSEventNotifyControl ProcessEvent(const SKSE::ModCallbackEvent* event,
                                              RE::BSTEventSource<SKSE::ModCallbackEvent>*) override
        {
            if (!event || event->eventName != "AetheriusUI.ToView")
                return RE::BSEventNotifyControl::kContinue;
            const std::string payload(event->strArg.c_str());
            if (payload.size() > kMaxBridgeBytes)
                return RE::BSEventNotifyControl::kContinue;
            SKSE::GetTaskInterface()->AddTask([payload]() { RouteClientPacket(payload); });
            return RE::BSEventNotifyControl::kContinue;
        }
    } g_modEventSink;

    class KeyboardSink final : public RE::BSTEventSink<RE::InputEvent*>
    {
    public:
        RE::BSEventNotifyControl ProcessEvent(RE::InputEvent* const* events,
                                              RE::BSTEventSource<RE::InputEvent*>*) override
        {
            for (auto* event = events ? *events : nullptr; event; event = event->next) {
                if (event->GetEventType() != RE::INPUT_EVENT_TYPE::kButton)
                    continue;
                auto* button = event->AsButtonEvent();
                if (!button || button->GetDevice() != RE::INPUT_DEVICE::kKeyboard || !button->IsDown() ||
                    button->GetIDCode() != RE::BSKeyboardDevice::Keys::kTab)
                    continue;

                if (!g_views || g_mainView == Meridian::UI::View::INVALID_VIEW_HANDLE || !g_views->IsReady(g_mainView))
                    return RE::BSEventNotifyControl::kContinue;

                if (g_views && g_mainView != Meridian::UI::View::INVALID_VIEW_HANDLE && g_views->HasFocus(g_mainView)) {
                    // Meridian normally routes this focused key to CEF first. If this sink sees it,
                    // forward the same semantic action to the page and stop the vanilla TAB menu.
                    SKSE::GetTaskInterface()->AddTask([]() {
                        if (g_views && g_mainView != Meridian::UI::View::INVALID_VIEW_HANDLE)
                            g_views->ExecuteJavaScript(g_mainView, "window.AetheriusUI&&window.AetheriusUI.nativeTab();");
                    });
                    return RE::BSEventNotifyControl::kStop;
                }
                if (!CanOpenInCurrentGameState())
                    return RE::BSEventNotifyControl::kContinue;
                SKSE::GetTaskInterface()->AddTask([]() { OpenMainView(); });
                return RE::BSEventNotifyControl::kStop;
            }
            return RE::BSEventNotifyControl::kContinue;
        }
    } g_keyboardSink;

    class MenuSink final : public RE::BSTEventSink<RE::MenuOpenCloseEvent>
    {
    public:
        RE::BSEventNotifyControl ProcessEvent(const RE::MenuOpenCloseEvent* event,
                                              RE::BSTEventSource<RE::MenuOpenCloseEvent>*) override
        {
            if (!event || !event->opening)
                return RE::BSEventNotifyControl::kContinue;
            for (const auto* menu : {"Console", "Main Menu", "Loading Menu", "Dialogue Menu", "RaceSex Menu", "Fader Menu"}) {
                if (event->menuName == menu) {
                    SKSE::GetTaskInterface()->AddTask([]() { CloseMainView(); });
                    break;
                }
            }
            return RE::BSEventNotifyControl::kContinue;
        }
    } g_menuSink;

    void OnMainDOMReady(Meridian::UI::View::ViewHandle handle)
    {
        if (!g_views || handle != g_mainView)
            return;
        g_views->RegisterListener(handle, "aetheriusUiSend", &OnSendEnvelope);
        g_views->RegisterListener(handle, "aetheriusUiSetFocus", &OnSetFocus);
        g_views->ExecuteJavaScript(handle, "window.AetheriusUI&&window.AetheriusUI.nativeFocusChanged(false);");
        spdlog::info("AetheriusUI: main Meridian view ready");
    }

    void CreateViews()
    {
        if (!g_views || g_mainView != Meridian::UI::View::INVALID_VIEW_HANDLE)
            return;

        Meridian::UI::View::ViewCreateInfo mainInfo{};
        mainInfo.ownerName = kMainOwner;
        mainInfo.viewName = "main";
        mainInfo.startUrl = kMainUrl;
        mainInfo.initiallyVisible = false;
        mainInfo.onDOMReady = &OnMainDOMReady;
        g_mainView = g_views->CreateView(&mainInfo);
        if (g_mainView == Meridian::UI::View::INVALID_VIEW_HANDLE) {
            spdlog::error("AetheriusUI: failed to create Meridian main view");
            return;
        }

        Meridian::UI::View::ViewCreateInfo hudInfo{};
        hudInfo.ownerName = kHudOwner;
        hudInfo.viewName = "hud";
        hudInfo.startUrl = kHudUrl;
        hudInfo.frameRate = 30;
        hudInfo.initiallyVisible = true;
        g_hudView = g_views->CreateView(&hudInfo);

        if (g_input) {
            Meridian::UI::Input::ViewInputConfig config{};
            config.enabled = 1;
            config.allowCursor = 1;
            const auto configured = g_input->ConfigureView(g_mainView, &config);

            Meridian::UI::Input::ShortcutInfo shortcut{};
            shortcut.button = Meridian::UI::Input::Control::Start;
            shortcut.modifier = Meridian::UI::Input::Control::LeftShoulder;
            shortcut.callback = &OnControllerOpen;
            const auto registered = g_input->RegisterShortcut(g_mainView, &shortcut, &g_openShortcut);
            spdlog::info("AetheriusUI: controller input config={} opener={} handle={}",
                         static_cast<unsigned>(configured), static_cast<unsigned>(registered), g_openShortcut);
        }
        spdlog::info("AetheriusUI: main view={} HUD view={} (Meridian View/1)", g_mainView, g_hudView);
    }

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

extern "C" __declspec(dllexport) bool SKSEAPI SKSEPlugin_Query(const SKSE::QueryInterface* skse, SKSE::PluginInfo* info)
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
    if (const auto events = SKSE::GetModCallbackEventSource())
        events->AddEventSink(&g_modEventSink);
    return SKSE::GetMessagingInterface()->RegisterListener([](SKSE::MessagingInterface::Message* message) {
        if (message->type == SKSE::MessagingInterface::kInputLoaded) {
            Meridian::UI::Settings settings{};
            g_views = Meridian::UI::View::Query(&settings, kPluginName);
            g_input = Meridian::UI::Input::Query(&settings, kPluginName);
            spdlog::info("AetheriusUI: Meridian View/1={} Input/1={}", g_views != nullptr, g_input != nullptr);
        } else if (message->type == SKSE::MessagingInterface::kDataLoaded) {
            RE::BSInputDeviceManager::GetSingleton()->AddEventSink(&g_keyboardSink);
            if (const auto ui = RE::UI::GetSingleton())
                ui->AddEventSink(&g_menuSink);
            CreateViews();
        } else if (message->type == SKSE::MessagingInterface::kPreLoadGame) {
            SKSE::GetTaskInterface()->AddTask([]() { CloseMainView(); });
        }
    });
}
