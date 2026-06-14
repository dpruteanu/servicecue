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
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private startedAt = 0;
  private pausedAt = 0;
  private volume = 1;
  private status: PlaybackStatus = "idle";
  private onEnded?: () => void;

  constructor() {
    this.context = new AudioContext();
    this.output = this.context.createMediaStreamDestination();
    this.sink = new Audio();
    this.sink.srcObject = this.output.stream;
    this.sink.autoplay = true;
    this.gain = this.context.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.output);
  }

  get currentStatus() {
    return this.status;
  }

  get durationSeconds() {
    return this.buffer?.duration ?? 0;
  }

  get currentTimeSeconds() {
    if (this.status === "playing" || this.status === "fading") {
      return Math.min(this.context.currentTime - this.startedAt, this.durationSeconds);
    }

    return Math.min(this.pausedAt, this.durationSeconds);
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
    this.buffer = await this.context.decodeAudioData(data.slice(0));
    this.pausedAt = 0;
    this.status = "stopped";

    return {
      filePath,
      fileName: filePath.split(/[\\/]/).pop() ?? filePath,
      durationSeconds: this.buffer.duration,
    };
  }

  async play() {
    if (!this.buffer) {
      return;
    }

    if (this.status === "playing" || this.status === "fading") {
      return;
    }

    await this.context.resume();
    await this.sink.play();
    this.startSource(this.pausedAt);
    this.status = "playing";
  }

  async pause() {
    if (this.status !== "playing" || !this.source) {
      return;
    }

    const now = this.context.currentTime;
    this.pausedAt = this.currentTimeSeconds;
    this.rampGainTo(0, STOP_FADE_SECONDS);
    const source = this.source;

    window.setTimeout(() => {
      source.stop();
      source.disconnect();
      if (this.source === source) {
        this.source = undefined;
      }
      this.status = "paused";
      this.gain.gain.setValueAtTime(this.volume, this.context.currentTime);
    }, STOP_FADE_SECONDS * 1000);
  }

  async stop() {
    if (!this.source) {
      this.pausedAt = 0;
      this.status = "stopped";
      return;
    }

    const source = this.source;
    this.rampGainTo(0, STOP_FADE_SECONDS);

    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        source.stop();
        source.disconnect();
        if (this.source === source) {
          this.source = undefined;
        }
        this.pausedAt = 0;
        this.status = "stopped";
        this.gain.gain.cancelScheduledValues(this.context.currentTime);
        this.gain.gain.setValueAtTime(this.volume, this.context.currentTime);
        resolve();
      }, STOP_FADE_SECONDS * 1000);
    });
  }

  async restart() {
    await this.stop();
    await this.play();
  }

  async fadeOut(seconds = 5) {
    if (!this.source || this.status !== "playing") {
      return;
    }

    this.status = "fading";
    const source = this.source;
    this.rampGainTo(0, seconds);

    window.setTimeout(() => {
      source.stop();
      source.disconnect();
      if (this.source === source) {
        this.source = undefined;
      }
      this.pausedAt = 0;
      this.status = "stopped";
      this.gain.gain.cancelScheduledValues(this.context.currentTime);
      this.gain.gain.setValueAtTime(this.volume, this.context.currentTime);
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

    await sink.pause();
    await testContext.close();
  }

  private startSource(offsetSeconds: number) {
    const buffer = this.buffer;

    if (!buffer) {
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source !== source) {
        return;
      }

      this.source = undefined;
      if (this.status === "playing" || this.status === "fading") {
        this.pausedAt = 0;
        this.status = "stopped";
        this.onEnded?.();
      }
    };

    this.source = source;
    this.startedAt = this.context.currentTime - offsetSeconds;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(this.volume, this.context.currentTime);
    source.start(0, offsetSeconds);
  }

  private rampGainTo(value: number, seconds: number) {
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(value, now + seconds);
  }
}
