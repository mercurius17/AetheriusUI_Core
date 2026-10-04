#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>
#include <nlohmann/json.hpp>
#include <spdlog/sinks/basic_file_sink.h>
#include <spdlog/spdlog.h>

#include "MeridianUIAPI/ViewDllLoader.h"
#include "MeridianUIAPI/InputDllLoader.h"
#include "MeridianUIAPI/KeyboardMovementDllLoader.h"
#include "MeridianUIAPI/RenderLayerDllLoader.h"
#include "MeridianUIAPI/NifViewDllLoader.h"

#include <memory>
#include <string>
#include <string_view>
#include <deque>
#include <cstring>
#include <charconv>
#include <cmath>
#include <unordered_set>
#include <atomic>

namespace
{
    void ClearPreview();
    void CloseMainView();
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
    Meridian::UI::KeyboardMovement::IKeyboardMovementAPI* g_movement = nullptr;
    Meridian::UI::View::ViewHandle g_mainView = Meridian::UI::View::INVALID_VIEW_HANDLE;
    Meridian::UI::View::ViewHandle g_hudView = Meridian::UI::View::INVALID_VIEW_HANDLE;
    Meridian::UI::Input::ShortcutHandle g_openShortcut = 0;
    bool g_mainActive = false;
    std::deque<std::string> g_pendingPackets;
    std::size_t g_pendingBytes = 0;
    bool g_mainReady = false;
    Meridian::UI::RenderLayer::IRenderLayerAPI* g_surfaces = nullptr;
    Meridian::UI::NifView::INifViewAPI* g_nif = nullptr;
    Meridian::UI::RenderLayer::SurfaceHandle g_preview = 0;
    std::string g_previewToken;
    std::unordered_set<std::string> g_previewTokens;
    std::string g_mapRequest;
    std::atomic<std::uint32_t> g_mapGeneration{0};

    std::string StringField(const json& object, const char* field)
    {
        const auto found = object.find(field);
        return found != object.end() && found->is_string() ? found->get<std::string>() : std::string{};
    }

    json ParseBounded(std::string_view value)
    {
        return json::parse(value, [](int depth, json::parse_event_t, json&) {
            if (depth > 24) throw std::runtime_error("JSON nesting limit");
            return true;
        });
    }

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
        for (const auto* menu : {"Console", "Main Menu", "Loading Menu", "Dialogue Menu", "RaceSex Menu", "Fader Menu", "MapMenu"}) {
            if (ui->IsMenuOpen(menu))
                return false;
        }
        return true;
    }

    bool CloseMapForNavigationKey()
    {
        auto* ui = RE::UI::GetSingleton();
        if (!ui || !ui->IsMenuOpen(RE::MapMenu::MENU_NAME)) return false;
        CloseMainView();
        SKSE::GetTaskInterface()->AddUITask([]() {
            if (auto* queue = RE::UIMessageQueue::GetSingleton())
                queue->AddMessage(RE::MapMenu::MENU_NAME, RE::UI_MESSAGE_TYPE::kHide, nullptr);
        });
        spdlog::info("AetheriusUI: navigation key closes native map without opening radial");
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
        const bool wasActive = g_mainActive || g_views->HasFocus(g_mainView);
        g_mainActive = false;
        ClearPreview();
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
        if (g_views->HasFocus(g_mainView)) {
            g_mainActive = true;
            NotifyFocus(true);
            g_views->ExecuteJavaScript(g_mainView, "window.AetheriusUI&&window.AetheriusUI.nativeFocusChanged(true);");
            return;
        }
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
            if (CloseMapForNavigationKey()) return;
            if (g_views && g_mainView != Meridian::UI::View::INVALID_VIEW_HANDLE && g_views->HasFocus(g_mainView)) {
                g_views->ExecuteJavaScript(g_mainView, "window.AetheriusUI&&window.AetheriusUI.nativeTab();");
            } else {
                OpenMainView();
            }
        });
    }

    bool __cdecl OnKeyboardOpen(void*)
    {
        // Map takes precedence over pause/readiness guards. Meridian consumes
        // this key's down, repeats and release when this callback returns true.
        if (CloseMapForNavigationKey()) return true;
        if (!g_mainReady || !CanOpenInCurrentGameState() || !g_views || !g_views->IsReady(g_mainView)) return false;
        SKSE::GetTaskInterface()->AddTask([]() { OpenMainView(); });
        return true;
    }

    void __cdecl OnSendEnvelope(const char* rawPayload)
    {
        if (!rawPayload)
            return;
        const auto length = strnlen_s(rawPayload, kMaxBridgeBytes + 1);
        if (length > kMaxBridgeBytes) return;
        const std::string payload(rawPayload, length);
        if (payload.empty() || payload.size() > kMaxBridgeBytes)
            return;
        try {
            const auto parsed = ParseBounded(payload);
            if (!parsed.is_object() || parsed.value("protocolVersion", 0) != 1 ||
                !parsed.contains("kind") || parsed.value("kind", std::string{}) != "request")
                return;
            // No browser payload or untrusted log text is recorded here.
        } catch (...) {
            return;
        }
        SKSE::GetTaskInterface()->AddTask([payload]() {
            // Refresh from the actual Meridian focus owner before the request.
            // The client may have subscribed after the original TAB notification.
            NotifyFocus(g_views && g_views->HasFocus(g_mainView));
            SendModEvent("AetheriusUI.FromView", payload);
        });
    }

    void __cdecl OnSetFocus(const char* rawPayload)
    {
        if (!rawPayload)
            return;
        bool focused = false;
        try {
            if (strnlen_s(rawPayload, 6) > 5) return;
            focused = ParseBounded(rawPayload).get<bool>();
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

    void VisualResult(const std::string& id, bool ok, const char* status, const char* reason = "")
    {
        if (!g_views || id.empty()) return;
        const auto script = std::string("window.dispatchEvent(new CustomEvent('aetherius-native-visual',{detail:") +
            json{{"requestId", id}, {"ok", ok}, {"status", status}, {"reason", reason}}.dump() + "}));";
        g_views->ExecuteJavaScript(g_mainView, script.c_str());
    }

    void ClearPreview()
    {
        if (g_surfaces && g_preview) g_surfaces->SetVisible(g_preview, false);
        if (g_nif && g_preview) g_nif->ClearModel(g_preview);
        g_previewToken.clear();
    }

    const char* PreviewStatus()
    {
        if (!g_nif || !g_preview) return "unsupported";
        switch (g_nif->GetStatus(g_preview)) {
        case Meridian::UI::NifView::Status::Ready: return "ready";
          case Meridian::UI::NifView::Status::Loading: return "loading";
          case Meridian::UI::NifView::Status::Failed: return "failed";
        default: return "unsupported";
        }
    }

    bool EnsurePreviewSurface()
    {
        if (g_preview) return true;
        if (!g_surfaces || !g_nif) return false;
        Meridian::UI::RenderLayer::SurfaceCreateInfo info{};
        info.ownerName = kMainOwner;
        info.surfaceName = "inventory-preview";
        info.width = info.height = 1;
        info.zOrder = -100; // Beneath the transparent Chromium preview aperture.
        g_preview = g_surfaces->CreateSurface(&info);
        return g_preview != 0;
    }

    void HandleVisual(const json& request)
    {
        const auto action = StringField(request, "action"), id = StringField(request, "requestId");
        if (id.size() > 64 || id.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-") != std::string::npos) return;
        try {
            if (action == "mapCancel") {
                if (g_mapRequest == id) {
                    g_mapRequest.clear();
                    ++g_mapGeneration;
                    if (!RE::UI::GetSingleton()->IsMenuOpen(RE::MapMenu::MENU_NAME)) OpenMainView();
                }
                return;
            }
            if (action == "mapOpen") {
                const bool focused = g_views && g_views->HasFocus(g_mainView);
                spdlog::info("AetheriusUI: native map requested; Meridian focus={} cached active={}", focused, g_mainActive);
                auto* controls = RE::ControlMap::GetSingleton();
                // Dispatch is authenticated to this Meridian view. Opening a
                // local visual menu does not require a client's cached focus
                // flag; engine state and menu-control guards remain mandatory.
                if (!CanOpenInCurrentGameState() || !controls || !controls->IsMenuControlsEnabled() || !g_mapRequest.empty())
                    throw std::runtime_error("O mapa não pode ser aberto no estado atual do jogo.");
                for (const auto* menu : {"InventoryMenu", "MagicMenu", "ContainerMenu", "BarterMenu", "Crafting Menu", "Book Menu", "Journal Menu", "Sleep/Wait Menu", "TweenMenu"})
                    if (RE::UI::GetSingleton()->IsMenuOpen(menu)) throw std::runtime_error("Feche o outro menu antes de abrir o mapa.");
                g_mapRequest = id;
                const auto generation = ++g_mapGeneration;
                // A committed native transition may close the radial without
                // its AbortSignal cancelling the MapMenu that replaces it.
                VisualResult(id, true, "committed");
                CloseMainView();
                SKSE::GetTaskInterface()->AddUITask([id, generation]() {
                    if (g_mapGeneration.load() != generation) return;
                    auto* queue = RE::UIMessageQueue::GetSingleton();
                    if (!queue) { SKSE::GetTaskInterface()->AddTask([id]() { VisualResult(id, false, "failed", "Fila de menus do Skyrim indisponível."); if (g_mapRequest == id) g_mapRequest.clear(); }); return; }
                    // Meridian's unfocus UI task precedes this task, so its
                    // FocusMenu hide is queued before the native MapMenu show.
                    queue->AddMessage(RE::MapMenu::MENU_NAME, RE::UI_MESSAGE_TYPE::kShow, nullptr);
                    spdlog::info("AetheriusUI: native MapMenu show queued");
                });
                return;
            }
            if (action == "previewHide") { if (g_surfaces && g_preview) g_surfaces->SetVisible(g_preview, false); return; }
            if (action == "previewClear") { ClearPreview(); return; }
            if (!g_views || !g_views->HasFocus(g_mainView) || !EnsurePreviewSurface()) throw std::runtime_error("Renderer de modelos nativos indisponível.");
            if (action == "previewRect") {
                const auto& rect = request.at("rect");
                const double x = rect.at("x"), y = rect.at("y"), w = rect.at("width"), h = rect.at("height"), vw = rect.at("viewportWidth"), vh = rect.at("viewportHeight");
                if (!std::isfinite(x + y + w + h + vw + vh) || x < 0 || y < 0 || w <= 0 || h <= 0 || vw <= 0 || vh <= 0 || x + w > vw + 1 || y + h > vh + 1) return;
                auto* graphics = RE::BSGraphics::State::GetSingleton();
                if (!graphics || graphics->screenWidth > 32768 || graphics->screenHeight > 32768) return;
                const auto sx = graphics->screenWidth / vw, sy = graphics->screenHeight / vh;
                g_surfaces->SetRect(g_preview, static_cast<int>(x * sx), static_cast<int>(y * sy), (std::max)(1, static_cast<int>(w * sx)), (std::max)(1, static_cast<int>(h * sy)));
                return;
            }
            if (action == "previewCamera") {
                const auto& value = request.at("camera");
                Meridian::UI::NifView::CameraState camera{};
                camera.yawDegrees = value.at("yawDegrees"); camera.pitchDegrees = value.at("pitchDegrees"); camera.distanceScale = value.at("distanceScale");
                if (!std::isfinite(camera.yawDegrees) || !std::isfinite(camera.pitchDegrees) || !std::isfinite(camera.distanceScale) || std::abs(camera.yawDegrees) > 360 || std::abs(camera.pitchDegrees) > 75 || camera.distanceScale < .35F || camera.distanceScale > 3.F) return;
                camera.lightingPreset = Meridian::UI::NifView::LightingPreset::Bright;
                g_nif->SetCamera(g_preview, &camera);
                return;
            }
            const auto token = StringField(request, "token");
            if (!g_previewTokens.contains(token)) throw std::runtime_error("Selecione novamente um item confirmado pelo servidor.");
            if (action == "previewShow" && token != g_previewToken) {
                constexpr std::string_view prefix = "native-preview:";
                if (!token.starts_with(prefix) || token.size() > prefix.size() + 8) throw std::runtime_error("Token de modelo inválido.");
                std::uint32_t formID = 0;
                const auto parsed = std::from_chars(token.data() + prefix.size(), token.data() + token.size(), formID, 16);
                if (parsed.ec != std::errc{} || parsed.ptr != token.data() + token.size() || !formID) throw std::runtime_error("Token de modelo inválido.");
                auto* form = RE::TESForm::LookupByID(formID);
                RE::TESModel* model = nullptr;
                if (auto* armor = form ? form->As<RE::TESObjectARMO>() : nullptr) {
                    model = &armor->worldModels[0];
                    if (!model->GetModel() || !*model->GetModel()) model = &armor->worldModels[1];
                }
                else if (form) model = skyrim_cast<RE::TESModel*>(form);
                const auto* path = model ? model->GetModel() : nullptr;
                if (!path || !*path) throw std::runtime_error("Este item não possui modelo de inventário disponível.");
                Meridian::UI::NifView::NifLoadInfo load{};
                load.surface = g_preview; load.modelPath = path;
                if (!g_nif->LoadModel(&load)) throw std::runtime_error("O renderer não conseguiu carregar este modelo.");
                g_previewToken = token;
            } else if (action != "previewShow" && action != "previewStatus") throw std::runtime_error("Ação visual não permitida.");
            if (token != g_previewToken) throw std::runtime_error("A seleção do modelo foi alterada.");
            if (action == "previewShow") g_surfaces->SetVisible(g_preview, true);
            VisualResult(id, true, PreviewStatus());
        } catch (const std::exception&) {
            // Report a bounded product message; never log browser payloads.
            VisualResult(id, false, "failed", action == "mapOpen" ? "O mapa não pode ser aberto no estado atual do jogo." : "Modelo indisponível para este item.");
        }
    }

    void __cdecl OnNativeVisual(const char* raw)
    {
        if (!raw || strnlen_s(raw, 2049) > 2048) return;
        try {
            auto request = ParseBounded(raw);
            if (!request.is_object()) return;
            SKSE::GetTaskInterface()->AddTask([request = std::move(request)]() { HandleVisual(request); });
        } catch (...) { /* Reject malformed local presentation requests. */ }
    }

    void RouteClientPacket(std::string packet)
    {
        if (packet.empty() || packet.size() > kMaxBridgeBytes)
            return;
        json parsed;
        try {
            parsed = ParseBounded(packet);
        } catch (...) {
            return;
        }
        if (!parsed.is_object())
            return;

        if (StringField(parsed, "type") == "session")
            g_previewTokens.clear();
        if (StringField(parsed, "type") == "session")
            spdlog::info("AetheriusUI: client session delivered (main ready={})", g_mainReady);

        if (StringField(parsed, "type") == "disconnect") {
            g_pendingPackets.clear();
            g_pendingBytes = 0;
            g_previewTokens.clear();
            g_mapRequest.clear();
            ++g_mapGeneration;
            CloseMainView();
            if (g_hudView != Meridian::UI::View::INVALID_VIEW_HANDLE)
                DispatchToView(g_hudView, "aetherius-hud-state", json{{"type", "hud"}, {"source", "server"}, {"state", json::object()}}.dump());
        }
        if (!g_mainReady) {
            if (StringField(parsed, "type") == "session") {
                g_pendingPackets.clear();
                g_pendingBytes = 0;
            }
            if (g_pendingPackets.size() < 128 && g_pendingBytes + packet.size() <= 512U * 1024U) {
                g_pendingBytes += packet.size();
                g_pendingPackets.push_back(std::move(packet));
            } else spdlog::warn("AetheriusUI: pre-ready queue limit reached");
            return;
        }

        const auto envelope = parsed.value("envelope", json::object());
        if (envelope.is_object() && StringField(envelope, "kind") == "response" && StringField(envelope, "moduleId") == "inventory") {
            const auto payload = envelope.value("payload", json::object());
            if (payload.is_object() && payload.contains("item") && payload["item"].is_object()) {
                const auto token = StringField(payload, "previewToken");
                if (token.starts_with("native-preview:") && token.size() <= 23) {
                    if (g_previewTokens.size() >= 64) g_previewTokens.clear();
                    g_previewTokens.insert(token);
                }
            }
        }
        if (envelope.is_object() && StringField(envelope, "moduleId") == "hud" &&
            (StringField(envelope, "kind") == "snapshot" || StringField(envelope, "kind") == "event")) {
            const auto hudPacket = json{{"type", "hud"}, {"source", "server"}, {"state", envelope.value("payload", json::object())}};
            DispatchToView(g_hudView, "aetherius-hud-state", hudPacket.dump());
            if (g_views && g_hudView != Meridian::UI::View::INVALID_VIEW_HANDLE) {
                if (CanOpenInCurrentGameState()) g_views->Show(g_hudView); else g_views->Hide(g_hudView);
            }
            return;
        }

        if (StringField(parsed, "type") == "hud" && StringField(parsed, "source") == "server") {
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
            const auto length = strnlen_s(event->strArg.c_str(), kMaxBridgeBytes + 1);
            if (length > kMaxBridgeBytes) return RE::BSEventNotifyControl::kContinue;
            const std::string payload(event->strArg.c_str(), length);
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
            if (event->menuName == RE::MapMenu::MENU_NAME) {
                SKSE::GetTaskInterface()->AddTask([]() {
                    const auto id = std::exchange(g_mapRequest, {});
                    if (id.empty()) return;
                    VisualResult(id, true, "opened");
                    spdlog::info("AetheriusUI: native MapMenu opening confirmed");
                });
            }
            for (const auto* menu : {"Console", "Main Menu", "Loading Menu", "Dialogue Menu", "RaceSex Menu", "Fader Menu"}) {
                if (event->menuName == menu) {
                    SKSE::GetTaskInterface()->AddTask([]() {
                        ++g_mapGeneration;
                        const auto id = std::exchange(g_mapRequest, {});
                        if (!id.empty()) VisualResult(id, false, "failed", "A abertura do mapa foi interrompida por outro menu.");
                        CloseMainView();
                        if (g_views && g_hudView != Meridian::UI::View::INVALID_VIEW_HANDLE) g_views->Hide(g_hudView);
                    });
                    break;
                }
            }
            return RE::BSEventNotifyControl::kContinue;
        }
    } g_menuSink;

    void OnMainDOMReady(Meridian::UI::View::ViewHandle handle)
    {
        SKSE::GetTaskInterface()->AddTask([handle]() {
            if (!g_views || handle != g_mainView) return;
            if (!g_views->RegisterListener(handle, "aetheriusUiSend", &OnSendEnvelope) ||
                !g_views->RegisterListener(handle, "aetheriusUiSetFocus", &OnSetFocus) ||
                !g_views->RegisterListener(handle, "aetheriusUiVisual", &OnNativeVisual)) {
                spdlog::error("AetheriusUI: failed to register browser listeners");
                return;
            }
            g_mainReady = true;
            g_views->ExecuteJavaScript(handle, "window.AetheriusUI&&window.AetheriusUI.nativeFocusChanged(false);");
            auto packets = std::move(g_pendingPackets);
            g_pendingPackets.clear();
            g_pendingBytes = 0;
            for (auto& packet : packets) RouteClientPacket(std::move(packet));
            SendModEvent("AetheriusUI.Ready", "1");
            spdlog::info("AetheriusUI: main Meridian view ready");
        });
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
        if (!g_movement || !g_movement->Configure(g_mainView, true, &OnKeyboardOpen, nullptr)) {
            spdlog::error("AetheriusUI: required Aetherius.KeyboardMovement/1 unavailable; interactive Core disabled");
            g_views->DestroyView(g_mainView);
            g_mainView = Meridian::UI::View::INVALID_VIEW_HANDLE;
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
        version.CompatibleVersions({ REL::Version(1, 6, 1170, 0) });
        return version;
    }
}

extern "C" __declspec(dllexport) constinit auto SKSEPlugin_Version = MakePluginVersionData();

extern "C" __declspec(dllexport) bool SKSEPlugin_Query(const SKSE::QueryInterface* skse, SKSE::PluginInfo* info)
{
    info->infoVersion = SKSE::PluginInfo::kVersion;
    info->name = kPluginName;
    info->version = 1;
    return !skse->IsEditor() && skse->RuntimeVersion() == REL::Version(1, 6, 1170, 0);
}

SKSEPluginLoad(const SKSE::LoadInterface* skse)
{
    if (skse->IsEditor() || skse->RuntimeVersion() != REL::Version(1, 6, 1170, 0))
        return false;
    InitializeLogging();
    SKSE::Init(skse, false);
    if (const auto events = SKSE::GetModCallbackEventSource())
        events->AddEventSink(&g_modEventSink);
    return SKSE::GetMessagingInterface()->RegisterListener([](SKSE::MessagingInterface::Message* message) {
        if (message->type == SKSE::MessagingInterface::kInputLoaded) {
            Meridian::UI::Settings settings{};
            g_views = Meridian::UI::View::Query(&settings, kPluginName);
            g_input = Meridian::UI::Input::Query(&settings, kPluginName);
            g_movement = Meridian::UI::KeyboardMovement::Query(&settings, kPluginName);
            g_surfaces = Meridian::UI::RenderLayer::Query(&settings, kPluginName);
            g_nif = Meridian::UI::NifView::Query(&settings, kPluginName);
            spdlog::info("AetheriusUI: Meridian View/1={} Input/1={}", g_views != nullptr, g_input != nullptr);
        } else if (message->type == SKSE::MessagingInterface::kDataLoaded) {
            // Opener consumption happens per event in Meridian's pre-dispatch
            // hook. A BST sink returning kStop would discard the whole batch.
            if (const auto ui = RE::UI::GetSingleton())
                ui->AddEventSink(&g_menuSink);
            CreateViews();
        } else if (message->type == SKSE::MessagingInterface::kPreLoadGame) {
            SKSE::GetTaskInterface()->AddTask([]() { CloseMainView(); });
        }
    });
}
