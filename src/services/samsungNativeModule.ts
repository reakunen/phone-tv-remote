import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type NativeSamsungResult = {
  token?: string;
  certificateFingerprintSha256?: string;
};

type NativeSamsungModule = {
  sendSamsungKey(
    host: string,
    key: string,
    token: string | null,
    pinnedFingerprintSha256: string | null
  ): Promise<NativeSamsungResult>;
};

let cachedModule: NativeSamsungModule | null | undefined;

function getNativeModule(): NativeSamsungModule | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  if (Platform.OS !== "ios") {
    cachedModule = null;
    return cachedModule;
  }

  try {
    cachedModule = requireNativeModule<NativeSamsungModule>("SamsungRemoteModule");
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}

export function isSamsungNativeModuleAvailable(): boolean {
  return getNativeModule() !== null;
}

export async function sendSamsungKeyWithNativeIOS(
  host: string,
  key: string,
  token?: string,
  pinnedFingerprintSha256?: string
): Promise<NativeSamsungResult> {
  const moduleRef = getNativeModule();

  if (!moduleRef) {
    throw new Error(
      "Samsung iOS native module not available. Build with prebuild/dev client (not Expo Go)."
    );
  }

  return moduleRef.sendSamsungKey(
    host,
    key,
    token ?? null,
    pinnedFingerprintSha256 ?? null
  );
}
