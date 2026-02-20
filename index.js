import { registerRootComponent } from "expo";
global.Buffer = global.Buffer || require("buffer").Buffer;

// Expo Router is the main entry (see package.json "main": "expo-router/entry").
// This file is a fallback: register the app root layout if loaded.
import RootLayout from "./app/_layout";
registerRootComponent(RootLayout);
