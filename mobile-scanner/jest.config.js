module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!(jest-)?react-native|expo(?!-router)|@expo|@react-native|@unimodules|sentry-expo|native-base)/",
  ],
};
