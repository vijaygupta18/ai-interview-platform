import type { TTSProvider } from "./types";
import { promisify } from "util";
import { execFile } from "child_process";
import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import os from "os";

const execFileAsync = promisify(execFile);

export class EdgeTTS implements TTSProvider {
  name = "edge";
  contentType = "audio/mpeg";

  async synthesize(text: string): Promise<Buffer> {
    const voice = process.env.EDGE_TTS_VOICE || "en-IN-NeerjaNeural";
    const rate = process.env.EDGE_TTS_RATE || "+10%";
    const tmpFile = join(os.tmpdir(), `edge-tts-${randomUUID()}.mp3`);

    try {
      await execFileAsync("edge-tts", [
        "--voice", voice,
        "--rate", rate,
        "--pitch=-6Hz",
        "--text", text,
        "--write-media", tmpFile,
      ], { timeout: 15000 });

      return await readFile(tmpFile);
    } finally {
      unlink(tmpFile).catch(() => {});
    }
  }
}
