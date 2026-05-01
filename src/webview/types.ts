export interface PlatformBridge {
  onMessage: (handler: (msg: unknown) => void) => void;
  postMessage: (msg: unknown) => void;
}

export interface AudioNoteBlock {
  t: number;
  end: number | null;
  text: string;
}

export interface AudioNoteDocument {
  audioPath: string;
  blocks: AudioNoteBlock[];
}

export interface InitMessage {
  type: "init";
  document: AudioNoteDocument;
  audioUri: string;
}
