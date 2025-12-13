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
        backgroundColor: "#0F172A",
        foregroundImage: "./assets/images/intro_logo.png"
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
          image: "./assets/images/intro_logo.png",
          imageWidth: 280,
          resizeMode: "contain",
          backgroundColor: "#0F172A",
          dark: {
            backgroundColor: "#0F172A"
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
      API_BASE: "http://192.168.1.4:3000",
      // 🔥 ADD THIS — REQUIRED 🔥
      eas: {
        projectId: "832ba12e-1832-4541-af2a-4d0ae03c0dd4"
      }
    }
  }
};
