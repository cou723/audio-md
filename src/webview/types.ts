export interface PlatformBridge {
  onMessage: (handler: (msg: unknown) => void) => void;
  postMessage: (msg: unknown) => void;
}

export interface AudioMDBlock {
  t: number;
  end: number | null;
  text: string;
}

export interface AudioMDDocument {
  audioPath: string;
  blocks: AudioMDBlock[];
}

export interface InitMessage {
  type: "init";
  document: AudioMDDocument;
  audioUri: string;
}
