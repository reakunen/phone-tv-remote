export type TVBrand =
  | "samsung"
  | "sony"
  | "roku"
  | "panasonic"
  | "vizio"
  | "tcl"
  | "lg"
  | "philips"
  | "firetv"
  | "other";

export type SavedTV = {
  id: string;
  nickname: string;
  brand: TVBrand;
  host?: string;
  port?: number;
};

export type RemoteCommand =
  | "power"
  | "input"
  | "up"
  | "down"
  | "left"
  | "right"
  | "ok"
  | "back"
  | "home"
  | "settings"
  | "volumeUp"
  | "volumeDown"
  | "channelUp"
  | "channelDown"
  | "mute"
  | "previous"
  | "playPause"
  | "next"
  | "numpad"
  | "digit0"
  | "digit1"
  | "digit2"
  | "digit3"
  | "digit4"
  | "digit5"
  | "digit6"
  | "digit7"
  | "digit8"
  | "digit9"
  | "numpadBackspace"
  | "numpadEnter";
