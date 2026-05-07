const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Monorepo workspace resolution
config.watchFolders = [path.resolve(__dirname, "../..")];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "../..", "node_modules"),
];

// Honor package.json#exports (needed for butr's react-native export condition)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
