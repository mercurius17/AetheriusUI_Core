# Matriz de validação

| Validação | Estado | Evidência |
|---|---|---|
| Auditoria e pin dos seis repositórios | EXECUTADO | Commits observados e estado inicial descritos em `REPOSITORY_AUDIT.md`; alterações locais só nos clones do client e server. |
| Catálogo com personagem + 11 slots, incluindo shop | EXECUTADO | Teste unitário do catálogo no Core. |
| Geometria derivada de N e centro 1.15× | EXECUTADO | Teste unitário em 1920×1080, 2560×1080, 3440×1440 e 1280×1024. |
| Envelope, limite, sessão, dedupe e patch revision | EXECUTADO | Testes unitários do protocolo, router, revisão e SDK. |
| Lifecycle de adapter, cancelamento e unload único | EXECUTADO | Testes unitários do registry incluindo unload durante mount e remount durante cleanup. |
| Frontend SDK correlation/session e bridge UTF-8 | EXECUTADO | Testes de contrato locais; não exercitam Skyrim/CEF. |
| Shell, componentes e IDs das fixtures | EXECUTADO (estático) | Teste textual do contrato; o fluxo real de `class` e `shop` ainda requer Meridian runtime. |
| Radial e fixture `server` no Live Server | EXECUTADO | Inspeção visual em viewport 864×892: onze nós externos visíveis, radial centrado e legenda separada. Clique em SERVIDOR abriu o estado vazio de Informações do servidor; nenhum dado foi simulado. |
| Client TypeScript build | EXECUTADO | `yarn build` em `referencias/repositories/aetherius-client/client`; Webpack 5.94 compilou com sucesso. |
| Server TypeScript build | EXECUTADO | `npm run build-ts` em `referencias/repositories/aetherius-server/server`; `tsc` e bundle esbuild passaram. |
| Core automatizado | EXECUTADO | `tests/run-tests.ps1`: 14/14 aprovados. |
| TypeScript estrito dos SDKs/shared/testes | EXECUTADO | `tsc --noEmit --strict` com libs ES2022/DOM e tipos Node passou. |
| Sintaxe JavaScript de shell, HUD e fixtures | EXECUTADO | `node --check` passou para shell e nova fixture `server`; a checagem anterior cobriu HUD e fixtures `class` e `shop`. |
| Font fornecida/copiada | EXECUTADO | SHA-256 idêntico nos dois arquivos: `B4B2D1B59DAF1BB628FA987F9AFCC3D16764AA7D6B858F4E683C6BE2867D9727`. |
| Bridge C++ / Meridian API | BLOQUEADO | Gerador Visual Studio não encontrou toolchain MSVC; tentativa MinGW detectou GCC 8.1, mas `CommonLibSSEConfig.cmake` não está instalado. Nenhum binário nativo foi gerado. |
| Registro/navegação E2E das fixtures `class` e `shop` | NÃO EXECUTADO | Requer pacote C++ compilado, Meridian e Skyrim; fixtures estão fora da distribuição padrão. |
| `TAB` substitui menu vanilla | NÃO EXECUTADO | Exige Skyrim/SKSE no runtime instalado. |
| WASD/corrida continuam e mouse-look fica suspenso | NÃO EXECUTADO | Gate M0: API pública do Meridian não prova passagem seletiva de movimento. |
| Clique/E/R/F/T não alcançam gameplay; texto recebe caracteres | NÃO EXECUTADO | Exige runtime, ControlMap/rebinding e verificação de foco reais. |
| Reconnect e snapshot com servidor + jogo | NÃO EXECUTADO | Os lados TypeScript compilaram; o fluxo ponta a ponta não foi executado em runtime. |
| 1080p/1440p, 16:9/21:9, UI scale e HUD passivo | NÃO EXECUTADO | Requer inspeção visual in-game. |
| Segurança, replay, spam e performance na modlist real | NÃO EXECUTADO | Requer ambiente de integração e benchmark do jogo. |

Nenhuma validação in-game é presumida a partir de build ou inspeção de código.
