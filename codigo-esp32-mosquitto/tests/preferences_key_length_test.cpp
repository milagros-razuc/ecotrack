#include <cstddef>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace {
constexpr std::size_t kMaxPreferencesKeyLength = 15;

const std::regex kPreferencesDeclaration(
    R"(\bPreferences\s+([A-Za-z_][A-Za-z0-9_]*)\s*;)");
const std::regex kPreferencesCall(
    R"REGEX(\b([A-Za-z_][A-Za-z0-9_]*)\.(begin|get[A-Za-z0-9_]*|put[A-Za-z0-9_]*|remove|isKey)\s*\(\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*)))REGEX");
const std::regex kStringConstant(
    R"REGEX(\b(?:constexpr\s+)?char\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*\]\s*=\s*"([^"]+)")REGEX");
}

int main() {
  const std::filesystem::path sourceRoot = "/src";
  std::unordered_set<std::string> preferenceObjects;
  std::unordered_map<std::string, std::string> stringConstants;
  std::size_t violations = 0;

  for (const auto& entry :
       std::filesystem::recursive_directory_iterator(sourceRoot)) {
    if (!entry.is_regular_file()) continue;
    const auto extension = entry.path().extension().string();
    if (extension != ".cpp" && extension != ".h" && extension != ".ino") {
      continue;
    }

    std::ifstream source(entry.path());
    if (!source) {
      std::cerr << "No se pudo leer " << entry.path() << std::endl;
      return 1;
    }
    const std::string content((std::istreambuf_iterator<char>(source)),
                              std::istreambuf_iterator<char>());

    for (std::sregex_iterator it(content.begin(), content.end(),
                                  kPreferencesDeclaration),
         end;
         it != end; ++it) {
      preferenceObjects.insert((*it)[1].str());
    }
    for (std::sregex_iterator it(content.begin(), content.end(),
                                  kStringConstant),
         end;
         it != end; ++it) {
      stringConstants[(*it)[1].str()] = (*it)[2].str();
    }
  }

  for (const auto& entry :
       std::filesystem::recursive_directory_iterator(sourceRoot)) {
    if (!entry.is_regular_file()) continue;
    const auto extension = entry.path().extension().string();
    if (extension != ".cpp" && extension != ".h" && extension != ".ino") {
      continue;
    }

    std::ifstream source(entry.path());
    const std::string content((std::istreambuf_iterator<char>(source)),
                              std::istreambuf_iterator<char>());
    for (std::sregex_iterator it(content.begin(), content.end(),
                                  kPreferencesCall),
         end;
         it != end; ++it) {
      const std::string object = (*it)[1].str();
      if (!preferenceObjects.count(object)) continue;
      const std::string literal = (*it)[3].matched
                                      ? (*it)[3].str()
                                      : stringConstants[(*it)[4].str()];
      if (literal.empty()) {
        std::cerr << "No se pudo resolver la clave o namespace en "
                  << entry.path() << std::endl;
        ++violations;
      } else if (literal.length() > kMaxPreferencesKeyLength) {
        std::cerr << entry.path() << ": clave o namespace '" << literal
                  << "' tiene " << literal.length()
                  << " caracteres (maximo " << kMaxPreferencesKeyLength << ")"
                  << std::endl;
        ++violations;
      }
    }
  }

  if (violations != 0) return 1;
  std::cout << "OK: claves y namespaces Preferences dentro del limite de 15 "
               "caracteres"
            << std::endl;
}
