import { ChildProcessWithoutNullStreams, exec, spawn } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import kill from "tree-kill";

export interface IEnd {
  exitCode?: number | string;
  duration?: number | null;
  output?: string;
  stream: string;
}

interface IOutput {
  error?: string;
  plugin?: string;
  metadata?: {
    id: string;
    author: string;
    category: string;
    title: string;
  };
  streams?: {
    [quality: string]: {
      type: "hls" | "http" | "muxed-stream" | "dash" | "hls7" | string;
      url: string;
      headers: any;
      master: string;
    };
  };
}

export declare interface Streamlink {
  on(event: "begin", listening: (link: string) => void): this;
  on(event: "end", listening: (info: IEnd) => void): this;
  on(event: "close", listening: () => void): this;
  on(event: "error", listening: (error: Error) => void): this;
  on(event: "log", listening: (log: string) => void): this;
}

export class Streamlink extends EventEmitter {
  public stream: string;
  public streaming: boolean = false;
  private outputLocation?: string;
  private qual: string = "best";
  private child?: ChildProcessWithoutNullStreams;
  private startTime?: number;
  private qualities: string[] = [];

  constructor(stream: string) {
    super();
    this.stream = stream;
  }

  public output = (location: string) => {
    this.outputLocation = location;
    return this;
  };

  public quality = (quality: string) => {
    this.qual = quality;
    return this;
  };

  public isLive = (callback: (isLive: boolean) => void) => {
    exec("streamlink --json " + this.stream, (_err, stdout) => {
      const json = JSON.parse(stdout) as IOutput;
      if (json.error) {
        callback(false);
      } else {
        this.qualities = Object.keys(json.streams!);
        callback(true);
      }
    });
  };

  public begin = () => {
    if (this.outputLocation && fs.existsSync(this.outputLocation)) {
      this.emit("error", "Can not create stream, file already exists.");
      return this;
    }

    this.isLive(live => {
      if (!live) {
        this.emit("error", "Can not start stream, stream is not live.");
        return;
      }

      const args = [];
      if (this.outputLocation) {
        args.push("-o");
        args.push(this.outputLocation);
      }
      args.push(this.stream);
      args.push(this.qual);
      this.startTime = Date.now();

      this.child = spawn("streamlink", args);
      this.child.stdout.on("data", chunk => {
        this.emit("log", chunk);
      });

      this.child.on("close", code => {
        this.emit("close");
        this.end(code);
      });

      this.streaming = true;
      this.emit("begin", this.stream);
    });
    return this;
  };

  public end = (exitCode: number) => {
    if (this.streaming) {
      const res: IEnd = {
        exitCode,
        output: this.outputLocation,
        stream: this.stream,
      };

      if (this.startTime) {
        res.duration = Math.floor((Date.now() - this.startTime) / 1000);
      }

      this.streaming = false;
      this.emit("end", res);
    }

    if (this.child) {
      kill(this.child.pid);
    }
    return;
  };

  public getQualities = (): void => {
    this.isLive(live => {
      if (!live) {
        this.emit("error", "Can not get qualities, stream is not live.");
        return;
      }

      this.emit("quality", this.qualities);
    });
  };
}
