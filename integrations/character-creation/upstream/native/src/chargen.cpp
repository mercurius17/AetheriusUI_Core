#include "chargen.h"

#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <string>
#include <string_view>

namespace Aetherius::Chargen
{
    namespace
    {
        using json = nlohmann::json;
        using Meridian::UI::View::INVALID_VIEW_HANDLE;
        Meridian::UI::View::IViewAPI* views = nullptr;
        Meridian::UI::View::ViewHandle handle = INVALID_VIEW_HANDLE;
        bool active = false;
        bool nativeDialogOpen = false;
        int selectedRaceIndex = -1;
        float cameraYaw = 0.0F;
        float cameraHeight = 0.0F;
        float cameraZoom = 0.0F;

        // The game's chargen camera is aimed at the actor for the full screen.
        // Shift its position sideways while our two side panels are displayed.
        struct CameraOffset
        {
            static void Update(RE::TESCamera* camera)
            {
                auto* root = camera->cameraRoot.get();
                if (root && shadowed && root == shadowRoot && Near(root->local.translate, shownPosition) &&
                    root->local.rotate == shownRotation) {
                    root->local.translate = enginePosition;
                    root->local.rotate = engineRotation;
                }
                shadowed = false;

                original(camera);
                root = camera->cameraRoot.get();
                if (!active || !root)
                    return;

                const auto engine = root->local.translate;
                const auto rotation = root->local.rotate;
                auto* player = RE::PlayerCharacter::GetSingleton();
                if (!player)
                    return;
                auto* model = player->Get3D(false);
                if (!model)
                    model = player->Get3D(true);
                if (!model)
                    return;
                static const RE::BSFixedString headName("NPC Head [Head]");
                const auto* head = model->GetObjectByName(headName);
                auto target = head ? head->world.translate : player->GetPosition();
                if (!head)
                    target.z += 120.0F;

                const auto toHead = target - engine;
                const float distance = toHead.Length();
                if (distance < 1.0F)
                    return;
                const RE::NiPoint3 axes[3] = {
                    root->local.rotate * RE::NiPoint3{1.0F, 0.0F, 0.0F},
                    root->local.rotate * RE::NiPoint3{0.0F, 1.0F, 0.0F},
                    root->local.rotate * RE::NiPoint3{0.0F, 0.0F, 1.0F},
                };
                RE::NiPoint3 forward = axes[1];
                float best = 0.0F;
                for (const auto& axis : axes) {
                    const float alignment = axis.Dot(toHead) / distance;
                    if (std::abs(alignment) > std::abs(best)) {
                        best = alignment;
                        forward = axis;
                    }
                }
                if (best < 0.0F)
                    forward = -forward;
                const float depth = forward.Dot(toHead);
                if (depth < 1.0F)
                    return;
                auto right = forward.Cross(RE::NiPoint3{0.0F, 0.0F, 1.0F});
                if (right.Unitize() < 0.01F)
                    return;

                // Orbit around the actor and offset the framing into the open
                // center. Keep the unmodified engine transform in shadow state.
                RE::NiMatrix3 orbit;
                orbit.MakeZRotation(cameraYaw);
                const float scale = std::exp(-cameraZoom);
                const auto orbitPosition = target + orbit * (engine - target) * scale;
                const auto orbitRight = orbit * right;
                auto shown = orbitPosition + orbitRight * (depth * scale * 0.24F);
                shown.z += cameraHeight;
                root->local.translate = shown;
                root->local.rotate = orbit * rotation;
                RE::NiUpdateData update{};
                root->Update(update);
                enginePosition = engine;
                engineRotation = rotation;
                shownPosition = shown;
                shownRotation = root->local.rotate;
                shadowRoot = root;
                shadowed = true;
            }

            static void Install()
            {
                REL::Relocation<std::uintptr_t> vtable{RE::VTABLE_RaceSexCamera[0]};
                original = vtable.write_vfunc(0x2, Update);
            }

            static void Reset()
            {
                shadowed = false;
                shadowRoot = nullptr;
            }

            static bool Near(const RE::NiPoint3& a, const RE::NiPoint3& b)
            {
                return std::abs(a.x - b.x) < 0.01F && std::abs(a.y - b.y) < 0.01F && std::abs(a.z - b.z) < 0.01F;
            }

            static inline REL::Relocation<decltype(Update)> original;
            static inline RE::NiNode* shadowRoot = nullptr;
            static inline RE::NiPoint3 enginePosition{};
            static inline RE::NiMatrix3 engineRotation{};
            static inline RE::NiPoint3 shownPosition{};
            static inline RE::NiMatrix3 shownRotation{};
            static inline bool shadowed = false;
        };

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

        RE::GPtr<RE::RaceSexMenu> CurrentMenu()
        {
            auto* ui = RE::UI::GetSingleton();
            return ui && ui->IsMenuOpen(RE::RaceSexMenu::MENU_NAME) ? ui->GetMenu<RE::RaceSexMenu>() : nullptr;
        }

        bool ReadArray(RE::GFxMovieView* movie, const char* path, RE::GFxValue& array)
        {
            return movie && movie->GetVariable(&array, path) && array.IsArray();
        }

        RE::GFxValue Entry(const RE::GFxValue& array, std::uint32_t index)
        {
            RE::GFxValue result;
            if (array.IsArray() && index < array.GetArraySize())
                array.GetElement(index, &result);
            return result;
        }

        RE::GFxValue Member(const RE::GFxValue& object, const char* key)
        {
            RE::GFxValue result;
            if (object.IsObject())
                object.GetMember(key, &result);
            return result;
        }

        std::string Text(const RE::GFxValue& object, const char* key)
        {
            const auto value = Member(object, key);
            return value.IsString() ? value.GetString() : std::string{};
        }

        double Number(const RE::GFxValue& object, const char* key, double fallback = 0.0)
        {
            const auto value = Member(object, key);
            return value.IsNumber() ? value.GetNumber() : fallback;
        }

        json Snapshot(RE::RaceSexMenu* menu)
        {
            json result{{"type", "snapshot"}, {"races", json::array()}, {"categories", json::array()}, {"sliders", json::array()}};
            if (!menu || !menu->uiMovie)
                return result;
            auto* movie = menu->uiMovie.get();
            RE::GFxValue list;
            constexpr auto racesPath = "_root.RaceSexMenuBaseInstance.RaceSexPanelsInstance._SubList1.entryList";
            constexpr auto categoriesPath = "_root.RaceSexMenuBaseInstance.RaceSexPanelsInstance._CategoriesList.entryList";
            constexpr auto slidersPath = "_root.RaceSexMenuBaseInstance.RaceSexPanelsInstance._SubList2.entryList";
            if (ReadArray(movie, racesPath, list)) {
                for (std::uint32_t i = 0; i < list.GetArraySize() && i < 128; ++i) {
                    const auto entry = Entry(list, i);
                    result["races"].push_back({{"index", i}, {"name", Text(entry, "text")},
                                                {"description", Text(entry, "raceDescription")},
                                                {"selected", selectedRaceIndex >= 0 ? static_cast<int>(i) == selectedRaceIndex
                                                                                    : Number(entry, "equipState") > 0.0}});
                }
            }
            if (ReadArray(movie, categoriesPath, list)) {
                for (std::uint32_t i = 0; i < list.GetArraySize() && i < 32; ++i) {
                    const auto entry = Entry(list, i);
                    result["categories"].push_back({{"index", i}, {"name", Text(entry, "text")}, {"flag", Number(entry, "flag")}});
                }
            }
            if (ReadArray(movie, slidersPath, list)) {
                for (std::uint32_t i = 0; i < list.GetArraySize() && i < 512; ++i) {
                    const auto entry = Entry(list, i);
                    if (Text(entry, "callbackName").empty())
                        continue;
                    const auto sliderName = Text(entry, "text");
                    const auto callback = Text(entry, "callbackName");
                    const bool isPreset = callback.find("Preset") != std::string::npos ||
                                          sliderName.find("Preset") != std::string::npos ||
                                          sliderName.find("predefini") != std::string::npos;
                    const bool isSex = callback == "ChangeSex" || sliderName.find("Sex") != std::string::npos ||
                                       sliderName.find("sex") != std::string::npos || sliderName.find("Gender") != std::string::npos ||
                                       sliderName.find("Sexo") != std::string::npos;
                    result["sliders"].push_back({{"index", i}, {"name", sliderName},
                                                   {"flag", Number(entry, "filterFlag")},
                                                   {"isSex", isSex},
                                                   {"isPreset", isPreset},
                                                   {"min", Number(entry, "sliderMin")},
                                                   {"max", Number(entry, "sliderMax")},
                                                   {"step", Number(entry, "interval", 1.0)},
                                                   {"value", Number(entry, "position")}});
                }
            }
            if (auto* player = RE::PlayerCharacter::GetSingleton()) {
                result["name"] = player->GetName();
                if (auto* base = player->GetActorBase())
                    result["sex"] = base->GetSex() == RE::SEX::kFemale ? "female" : "male";
            }
            return result;
        }

        void SendState()
        {
            const auto menu = CurrentMenu();
            if (!views || !menu || handle == INVALID_VIEW_HANDLE)
                return;
            const auto data = Base64(Snapshot(menu.get()).dump());
            const auto script = std::string("window.dispatchEvent(new CustomEvent('aetherius-chargen-state',{detail:'") + data + "'}));";
            views->ExecuteJavaScript(handle, script.c_str());
        }

        void Invoke(RE::RaceSexMenu* menu, const char* callback, double value = 0, double id = 0, bool withArgs = true)
        {
            if (!menu || !menu->fxDelegate || !menu->uiMovie)
                return;
            // FxDelegate receives an AS2 response slot followed by callback arguments.
            std::array<RE::GFxValue, 3> args{RE::GFxValue{}, RE::GFxValue(value), RE::GFxValue(id)};
            menu->fxDelegate->Callback(menu->uiMovie.get(), callback, args.data(), withArgs ? 3U : 1U);
        }

        void Command(json request)
        {
            const auto menu = CurrentMenu();
            if (!active || !menu || !request.is_object() || !menu->uiMovie)
                return;
            const auto type = request.value("type", std::string{});
            if (type == "snapshot") {
                SendState();
            } else if (type == "race") {
                RE::GFxValue list;
                if (!ReadArray(menu->uiMovie.get(), "_root.RaceSexMenuBaseInstance.RaceSexPanelsInstance._SubList1.entryList", list))
                    return;
                const auto index = request.value("index", -1);
                if (index >= 0 && index < static_cast<int>(list.GetArraySize())) {
                    Invoke(menu.get(), "ChangeRace", index);
                    selectedRaceIndex = index;
                    SendState();
                }
            } else if (type == "slider") {
                RE::GFxValue list;
                if (!ReadArray(menu->uiMovie.get(), "_root.RaceSexMenuBaseInstance.RaceSexPanelsInstance._SubList2.entryList", list))
                    return;
                const auto index = request.value("index", -1);
                if (index < 0 || index >= static_cast<int>(list.GetArraySize()))
                    return;
                auto entry = Entry(list, static_cast<std::uint32_t>(index));
                const auto callback = Text(entry, "callbackName");
                const auto value = request.value("value", 0.0);
                const auto min = Number(entry, "sliderMin");
                const auto max = Number(entry, "sliderMax");
                if (callback.empty() || callback.size() > 100 || !std::isfinite(value) || value < min || value > max || min > max)
                    return;
                Invoke(menu.get(), callback.c_str(), value, Number(entry, "sliderID"));
                // The SWF normally updates this after a slider drag; mirror that bookkeeping.
                entry.SetMember("position", RE::GFxValue(value));
                SendState();
            } else if (type == "camera") {
                const auto rotate = request.value("rotate", 0.0);
                const auto height = request.value("height", 0.0);
                const auto zoom = request.value("zoom", 0.0);
                if (!std::isfinite(rotate) || !std::isfinite(height) || !std::isfinite(zoom))
                    return;
                cameraYaw = std::remainder(cameraYaw + std::clamp(static_cast<float>(rotate), -15.0F, 15.0F) * 0.015F,
                                           6.2831853F);
                cameraHeight = std::clamp(cameraHeight + std::clamp(static_cast<float>(height), -15.0F, 15.0F), -90.0F, 15.0F);
                // Standard wheel detents change this by about 0.25; 0.60 is
                // two detents short of the previous 1.10 close-up limit.
                cameraZoom = std::clamp(cameraZoom + std::clamp(static_cast<float>(zoom), -8.0F, 8.0F) * 0.07F, -1.1F, 0.60F);
            } else if (type == "finish") {
                const auto name = request.value("name", std::string{});
                if (name.empty() || name.size() > 80 || name.find_first_of("\r\n") != std::string::npos)
                    return;
                // The Meridian confirmation is the sole commit action. Keep
                // name edits local until the player confirms here.
                menu->ChangeName(name.c_str());
            }
        }

        void __cdecl OnCommand(const char* payload)
        {
            if (!payload)
                return;
            const std::string input(payload);
            if (input.empty() || input.size() > 4096)
                return;
            try {
                const auto request = json::parse(input);
                if (auto* tasks = SKSE::GetTaskInterface())
                    tasks->AddTask([request]() { Command(request); });
            } catch (...) {
                spdlog::warn("AetheriusUI: malformed character creator request");
            }
        }

        void OnDOMReady(Meridian::UI::View::ViewHandle readyHandle)
        {
            if (!views || readyHandle != handle)
                return;
            views->RegisterListener(handle, "aetheriusChargen", &OnCommand);
            SKSE::GetTaskInterface()->AddTask([]() { Open(); });
        }
    }

    void CreateView(Meridian::UI::View::IViewAPI* viewAPI, Meridian::UI::Input::IInputAPI* input)
    {
        if (!viewAPI || handle != INVALID_VIEW_HANDLE)
            return;
        views = viewAPI;
        Meridian::UI::View::ViewCreateInfo info{};
        info.ownerName = "aetheriusui";
        info.viewName = "chargen";
        info.startUrl = "mod://aetheriusui/chargen.html";
        info.initiallyVisible = false;
        info.onDOMReady = &OnDOMReady;
        handle = views->CreateView(&info);
        if (handle == INVALID_VIEW_HANDLE)
            spdlog::error("AetheriusUI: failed to create character creator view");
        else if (input) {
            Meridian::UI::Input::ViewInputConfig config{};
            config.enabled = 1;
            config.allowCursor = 1;
            config.defaultMode = Meridian::UI::Input::Mode::Cursor;
            spdlog::info("AetheriusUI: character creator input result {}", static_cast<unsigned>(input->ConfigureView(handle, &config)));
        }
    }

    void Open()
    {
        const auto menu = CurrentMenu();
        if (!menu || !views || handle == INVALID_VIEW_HANDLE || !views->IsReady(handle))
            return;
        if (active) {
            SendState();
            return;
        }
        views->Show(handle);
        const auto focus = views->TryFocus(handle, Meridian::UI::View::FocusMode::PauseGame);
        if (focus != Meridian::UI::View::FocusResult::Granted && focus != Meridian::UI::View::FocusResult::AlreadyFocused) {
            views->Hide(handle);
            spdlog::warn("AetheriusUI: character creator focus denied ({})", static_cast<unsigned>(focus));
            return;
        }
        active = true;
        CameraOffset::Reset();
        nativeDialogOpen = false;
        selectedRaceIndex = -1;
        cameraYaw = 0.0F;
        cameraHeight = 0.0F;
        cameraZoom = 0.0F;
        // Keep the vanilla movie alive for its callbacks, but hide its artwork.
        if (menu->uiMovie)
            menu->uiMovie->SetVariable("_root.RaceSexMenuBaseInstance._alpha", RE::GFxValue(0.0), RE::GFxMovie::SetVarType::kNormal);
        views->ExecuteJavaScript(handle, "window.dispatchEvent(new Event('aetherius-chargen-open'));");
        SendState();
    }

    void Close(bool menuClosing)
    {
        if (!views || handle == INVALID_VIEW_HANDLE)
            return;
        if (active && !menuClosing) {
            const auto menu = CurrentMenu();
            if (menu && menu->uiMovie)
                menu->uiMovie->SetVariable("_root.RaceSexMenuBaseInstance._alpha", RE::GFxValue(100.0), RE::GFxMovie::SetVarType::kNormal);
        }
        active = false;
        CameraOffset::Reset();
        nativeDialogOpen = false;
        selectedRaceIndex = -1;
        cameraYaw = 0.0F;
        cameraHeight = 0.0F;
        cameraZoom = 0.0F;
        if (views->HasFocus(handle))
            views->Unfocus(handle);
        views->Hide(handle);
    }

    void OnMessageBoxOpened()
    {
        if (!active || !views || handle == INVALID_VIEW_HANDLE)
            return;
        nativeDialogOpen = true;
        if (views->HasFocus(handle))
            views->Unfocus(handle);
    }

    void OnMessageBoxClosed()
    {
        if (!nativeDialogOpen)
            return;
        nativeDialogOpen = false;
        if (!active || !views || handle == INVALID_VIEW_HANDLE || !CurrentMenu())
            return;
        views->TryFocus(handle, Meridian::UI::View::FocusMode::PauseGame);
    }

    void InstallCameraHook()
    {
        CameraOffset::Install();
        spdlog::info("AetheriusUI: chargen camera framing hook installed");
    }
}
