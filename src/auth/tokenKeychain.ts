import * as Keychain from "react-native-keychain";

const KEYCHAIN_SERVICE = "com.pawsomebond.firebase_id_token";
const KEYCHAIN_USERNAME = "pawsomebond_user";

export async function saveIdTokenToKeychain(token: string): Promise<void> {
  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, token, { service: KEYCHAIN_SERVICE });
}

export async function clearIdTokenFromKeychain(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    // ignore — already cleared or unavailable
  }
}
