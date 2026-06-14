export type PlaybackStatus = "idle" | "playing" | "paused" | "fading" | "stopped";

export type TrackInfo = {
  filePath: string;
  fileName: string;
  durationSeconds: number;
};

const STOP_FADE_SECONDS = 0.015;

export class ServiceCueAudioPlayer {
  private readonly context: AudioContext;
  private readonly output: MediaStreamAudioDestinationNode;
  private readonly sink: HTMLAudioElement;
  private readonly gain: GainNode;
  private readonly sourceElement: HTMLAudioElement;
  private readonly source: MediaElementAudioSourceNode;
  private objectUrl?: string;
  private volume = 1;
  private status: PlaybackStatus = "idle";
  private onEnded?: () => void;

  constructor() {
    this.context = new AudioContext();
    this.output = this.context.createMediaStreamDestination();
    this.sink = new Audio();
    this.sink.srcObject = this.output.stream;
    this.sink.autoplay = true;

    this.sourceElement = new Audio();
    this.sourceElement.preload = "auto";
    this.sourceElement.crossOrigin = "anonymous";
    this.sourceElement.addEventListener("ended", () => {
      this.status = "stopped";
      this.sourceElement.currentTime = 0;
      this.restoreGain();
      this.onEnded?.();
    });

    this.gain = this.context.createGain();
    this.gain.gain.value = this.volume;
    this.source = this.context.createMediaElementSource(this.sourceElement);
    this.source.connect(this.gain);
    this.gain.connect(this.output);
  }

  get currentStatus() {
    return this.status;
  }

  get durationSeconds() {
    return Number.isFinite(this.sourceElement.duration) ? this.sourceElement.duration : 0;
  }

  get currentTimeSeconds() {
    return this.sourceElement.currentTime;
  }

  seek(seconds: number) {
    if (!this.sourceElement.src || !Number.isFinite(seconds)) {
      return;
    }

    const duration = this.durationSeconds;
    const nextTime = duration > 0 ? Math.min(Math.max(seconds, 0), duration) : Math.max(seconds, 0);
    this.sourceElement.currentTime = nextTime;
  }

  async setOutputDevice(deviceId: string) {
    if (!this.sink.setSinkId) {
      throw new Error("Output device selection is not supported in this Electron runtime.");
    }

    await this.sink.setSinkId(deviceId);
  }

  setVolume(volume: number) {
    this.volume = volume;
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(volume, now, 0.01);
  }

  async load(filePath: string, data: ArrayBuffer, onEnded?: () => void): Promise<TrackInfo> {
    await this.stop();
    this.onEnded = onEnded;
    this.revokeObjectUrl();
    this.objectUrl = URL.createObjectURL(new Blob([data]));
    this.sourceElement.src = this.objectUrl;
    this.sourceElement.load();
    this.status = "stopped";

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.sourceElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
        this.sourceElement.removeEventListener("error", handleError);
      };
      const handleLoadedMetadata = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Could not play this file. Try checking the file or audio output."));
      };

      this.sourceElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      this.sourceElement.addEventListener("error", handleError);
    });

    return {
      filePath,
      fileName: filePath.split(/[\\/]/).pop() ?? filePath,
      durationSeconds: this.durationSeconds,
    };
  }

  async play() {
    if (!this.sourceElement.src || this.status === "playing" || this.status === "fading") {
      return;
    }

    await this.context.resume();
    await this.sink.play();
    this.restoreGain();
    await this.sourceElement.play();
    this.status = "playing";
  }

  async pause() {
    if (this.status !== "playing") {
      return;
    }

    this.rampGainTo(0, STOP_FADE_SECONDS);

    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        this.sourceElement.pause();
        this.status = "paused";
        this.restoreGain();
        resolve();
      }, STOP_FADE_SECONDS * 1000);
    });
  }

  async stop() {
    if (this.status !== "playing" && this.status !== "paused" && this.status !== "fading") {
      this.sourceElement.currentTime = 0;
      this.status = "stopped";
      return;
    }

    if (this.status === "paused") {
      this.sourceElement.currentTime = 0;
      this.status = "stopped";
      this.restoreGain();
      return;
    }

    this.rampGainTo(0, STOP_FADE_SECONDS);

    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        this.sourceElement.pause();
        this.sourceElement.currentTime = 0;
        this.status = "stopped";
        this.restoreGain();
        resolve();
      }, STOP_FADE_SECONDS * 1000);
    });
  }

  async restart() {
    if (!this.sourceElement.src) {
      return;
    }

    await this.stop();
    this.sourceElement.currentTime = 0;
    await this.play();
  }

  async fadeOut(seconds = 5) {
    if (this.status !== "playing") {
      return;
    }

    this.status = "fading";
    this.rampGainTo(0, seconds);

    window.setTimeout(() => {
      this.sourceElement.pause();
      this.sourceElement.currentTime = 0;
      this.status = "stopped";
      this.restoreGain();
      this.onEnded?.();
    }, seconds * 1000);
  }

  async playTestTone(deviceId: string) {
    const testContext = new AudioContext();
    const output = testContext.createMediaStreamDestination();
    const sink = new Audio();
    sink.srcObject = output.stream;

    if (sink.setSinkId) {
      await sink.setSinkId(deviceId);
    }

    const oscillator = testContext.createOscillator();
    const gain = testContext.createGain();
    const now = testContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.setValueAtTime(0.18, now + 0.45);
    gain.gain.linearRampToValueAtTime(0, now + 0.55);
    oscillator.connect(gain);
    gain.connect(output);

    await testContext.resume();
    await sink.play();
    oscillator.start(now);
    oscillator.stop(now + 0.56);

    await new Promise<void>((resolve) => {
      oscillator.onended = () => resolve();
    });

    sink.pause();
    await testContext.close();
  }

  private restoreGain() {
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.volume, now);
  }

  private rampGainTo(value: number, seconds: number) {
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(value, now + seconds);
  }

  private revokeObjectUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = undefined;
    }
  }
}
