export default {
  expo: {
    name: "pawsome",
    slug: "doggpt",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/intro_logo1.png",

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
        foregroundImage: "./assets/images/intro_logo1.png"
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
          image: "./assets/images/intro_logo2.png",
          resizeMode: "cover",
          backgroundColor: "#0F172A",
          dark: {
            backgroundColor: "#0F172A"
          }
        }
      ],
      "react-native-ble-plx",
      "expo-updates"
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },

    updates: {
      url: "https://u.expo.dev/383b6e8b-bd84-448c-96a1-f212946a0d6c",
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0
    },

    runtimeVersion: "1.0.0",

    extra: {
      router: {},
      API_BASE: "http://192.168.1.4:3000",
      eas: {
        projectId: "383b6e8b-bd84-448c-96a1-f212946a0d6c"
      }
    }
  }
};
