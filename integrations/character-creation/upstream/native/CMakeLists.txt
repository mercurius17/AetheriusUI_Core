cmake_minimum_required(VERSION 3.26)
project(AetheriusUIBridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(MERIDIAN_INCLUDE_DIR "" CACHE PATH "Directory containing MeridianUIAPI headers")
if(NOT EXISTS "${MERIDIAN_INCLUDE_DIR}/MeridianUIAPI/ViewDllLoader.h")
  message(FATAL_ERROR "Set MERIDIAN_INCLUDE_DIR to the directory containing MeridianUIAPI")
endif()

set(COMMONLIB_PATH "" CACHE PATH "Optional CommonLibSSE-NG source checkout")
if(COMMONLIB_PATH)
  add_subdirectory("${COMMONLIB_PATH}" commonlib)
else()
  find_package(CommonLibSSE CONFIG REQUIRED)
endif()
find_package(spdlog CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)

add_library(AetheriusUIBridge SHARED src/main.cpp src/chargen.cpp)
target_include_directories(AetheriusUIBridge PRIVATE "${MERIDIAN_INCLUDE_DIR}")
target_link_libraries(AetheriusUIBridge PRIVATE CommonLibSSE::CommonLibSSE spdlog::spdlog nlohmann_json::nlohmann_json)
target_compile_options(AetheriusUIBridge PRIVATE /W4 /permissive- /utf-8)
set_target_properties(AetheriusUIBridge PROPERTIES
  PREFIX ""
  OUTPUT_NAME "AetheriusUIBridge"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/SKSE/Plugins"
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/SKSE/Plugins")

add_custom_target(AetheriusUIAssets
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/MeridianUI/aetheriusui"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/Data/MeridianUI/aetheriusui/chargen.html"
          "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/Data/MeridianUI/aetheriusui/chargen.css"
          "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/Data/MeridianUI/aetheriusui/chargen.js"
          "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/Data/MeridianUI/aetheriusui/chargen-visuals.js"
          "${CMAKE_CURRENT_BINARY_DIR}/dist/$<CONFIG>/Data/MeridianUI/aetheriusui"
  VERBATIM)
add_dependencies(AetheriusUIBridge AetheriusUIAssets)
