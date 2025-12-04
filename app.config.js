export default {
  expo: {
    name: "pawsome",
    slug: "doggpt",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",

    scheme: "pawsomeapp",

    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.bondai.doggpt",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },

    android: {
      package: "com.pawsome.pawsome",

      permissions: [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.ACCESS_FINE_LOCATION"
      ],

      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },

      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,

      statusBar: {
        hidden: true,
        translucent: true,
        backgroundColor: "transparent"
      },
      navigationBar: {
        visible: "immersive",
        behavior: "insets",
        backgroundColor: "transparent"
      }
    },

    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },

    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000"
          }
        }
      ],
      "react-native-ble-plx"
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },

    extra: {
      router: {},

      // 🔥 ADD THIS — REQUIRED 🔥
      eas: {
        projectId: "aee8757a-4d44-4101-9182-f74cb40c72e2"
      },

      API_BASE: "http://192.168.1.4:3000"
    }
  }
};
