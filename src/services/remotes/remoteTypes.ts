export type VizioPairingChallenge = {
  challengeType: number;
  pairingReqToken: number;
  deviceId: string;
};

export type SonyPairingChallenge = {
  type: "psk";
};

export type RemotePairing =
  | {
      brand: "vizio";
      challenge: VizioPairingChallenge;
    }
  | {
      brand: "sony";
      challenge: SonyPairingChallenge;
    };

export type DispatchResult = {
  ok: boolean;
  message: string;
  pairing?: RemotePairing;
};
