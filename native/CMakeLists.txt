cmake_minimum_required(VERSION 3.26)
project(AetheriusUIBridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(MERIDIAN_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../referencias/repositories/MeridianUI" CACHE PATH "MeridianUI source checkout used for public consumer headers")

find_package(CommonLibSSE CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)

add_library(AetheriusUIBridge SHARED src/main.cpp)
target_include_directories(AetheriusUIBridge PRIVATE "${MERIDIAN_SOURCE_DIR}/src/UIPlatform")
target_link_libraries(AetheriusUIBridge PRIVATE CommonLibSSE::CommonLibSSE spdlog::spdlog nlohmann_json::nlohmann_json)
target_compile_options(AetheriusUIBridge PRIVATE /W4 /permissive- /utf-8)
set_target_properties(AetheriusUIBridge PROPERTIES
  PREFIX ""
  OUTPUT_NAME "AetheriusUIBridge"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/SKSE/Plugins"
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/SKSE/Plugins")

add_custom_target(AetheriusUIAssets
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/MeridianUI/aetheriusui"
  COMMAND ${CMAKE_COMMAND} -E copy_directory
          "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/Data/MeridianUI/aetheriusui"
          "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/MeridianUI/aetheriusui"
  VERBATIM)
add_dependencies(AetheriusUIBridge AetheriusUIAssets)

option(AETHERIUS_UI_INCLUDE_FIXTURES "Include test-only module adapters in the staged package" OFF)
if(AETHERIUS_UI_INCLUDE_FIXTURES)
  target_compile_definitions(AetheriusUIBridge PRIVATE AETHERIUS_UI_INCLUDE_FIXTURES=1)
  add_custom_target(AetheriusUITestFixtures
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/MeridianUI/aetheriusui/test-fixtures"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/test-fixtures"
            "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/MeridianUI/aetheriusui/test-fixtures"
    VERBATIM)
  add_dependencies(AetheriusUIBridge AetheriusUITestFixtures)
endif()
