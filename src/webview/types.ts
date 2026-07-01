export interface PlatformBridge {
  onMessage: (handler: (msg: unknown) => void) => void;
  postMessage: (msg: unknown) => void;
}

export interface SoundStampBlock {
  t: number;
  end: number | null;
  text: string;
}

export interface SoundStampDocument {
  audioPath: string;
  blocks: SoundStampBlock[];
}

export interface InitMessage {
  type: "init";
  document: SoundStampDocument;
  audioUri: string;
}
