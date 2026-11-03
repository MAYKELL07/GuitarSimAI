import { analyze } from "./analysis";
self.onmessage = (
  event: MessageEvent<{ samples: Float32Array; sampleRate: number }>,
) => {
  try {
    self.postMessage({
      result: analyze(event.data.samples, event.data.sampleRate, (p) =>
        self.postMessage({ progress: p }),
      ),
    });
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : "Analysis failed.",
    });
  }
};
