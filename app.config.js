export default {
  expo: {
    name: "DARYX",
    slug: "doggpt",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/intro_logo2.png",

    scheme: "pawsomeapp",

    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.bondai.doggpt",
      infoPlist: {
        // Required by App Store review for any app using encryption.
        ITSAppUsesNonExemptEncryption: false,
        // Required for Bluetooth LE on iOS – this is shown in the system prompt.
        NSBluetoothAlwaysUsageDescription:
          "PawsomeBond uses Bluetooth to connect to heart-rate monitors and the therapy vest.",
        // Older iOS / extra clarity; safe to include.
        NSBluetoothPeripheralUsageDescription:
          "PawsomeBond needs Bluetooth access to communicate with your vest and sensors."
      }
    },

    android: {
      package: "com.pawsomebond.app",
      googleServicesFile: "./google-services.json",
      label: "DARYX",

      permissions: [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.ACCESS_FINE_LOCATION"
      ],

      adaptiveIcon: {
        backgroundColor: "#0D1117",
        foregroundImage: "./assets/images/intro_logo2.png"
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
          resizeMode: "contain",
          backgroundColor: "#0D1117",
          dark: {
            backgroundColor: "#0D1117"
          }
        }
      ],
      "@react-native-firebase/app",
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
