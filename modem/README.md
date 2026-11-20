# Modem choice

The comparison used the upstream source commits below.

| Modem | Implementation and browser fit | Evidence and streaming |
| --- | --- | --- |
| [Sonance](https://github.com/sjqtentacles/sonance) · MIT · `c483e3336f76cbf37abbeb6403659da87be5c157` | Rust OFDM with LDPC and existing wasm-bindgen exports. The demo uses Web Audio and ScriptProcessor with a fixed 48 kHz assumption. SonicVision uses AudioWorklet and resamples microphone PCM when needed. | Upstream reports simulated 1 KB goodput of 2.5 kb/s for Balanced, 3.6 kb/s for Balanced superframes and 15.0 kb/s for Auto superframes at 32 dB AWGN. Its inspected field-results table is pending. The single-packet `encode` and incremental `WasmDecoder.push` suit live frames. Fountain APIs emit completed transfers and add buffering and redundancy. |
| [Cyrinx](https://github.com/dweekly/cyrinx) · Apache-2.0 with NOTICE · `cba849ed8eafdc06362b390dd9919c54ca99ce53` | Portable C codecs and native audio harnesses. Bulk and batch C APIs take PCM buffers. A browser port could compile the DSP subset with Emscripten and the vendored double-precision KissFFT backend, excluding Apple Accelerate and native transport timing/sleep. It would need exported buffers/functions and browser-side acquisition/framing around the bulk decoder. The portable DSP subset linked on macOS with KissFFT. A browser WASM build remains untested. | Upstream reports 65.875 kb/s verified payload for a specific Mac → Pixel recording/replay schedule and historical native iPhone results of 36.57 kb/s Mac → iPhone and 16.87 kb/s the other way. These runs use different native/offline paths. Its stream IDs belong to the native transport API. |
| [Sonic Transfer](https://github.com/arashtabaa/sonic-transfer) · MIT with notices · `30b643e3ccbdb192d0e527ab291eb3172dacc57b` | Browser TypeScript/Nuxt file app. Production waveform code uses MFSK despite the BFSK class name. Experimental multitone paths are separate. | Streaming demodulation feeds a fountain decoder that reconstructs files. The production throughput note describes synthetic PCM-length benchmarks and a future ≥2 kb/s target. No comparable validated Mac ↔ iPhone goodput was found in the inspected documentation. |

SonicVision uses Sonance Balanced, audible OFDM over roughly 1–9 kHz. Each packet carries a complete 1-bit frame, packed raw or with byte-level run lengths, and an application CRC. A subsequent valid frame restores the image after loss. At 128 × 96 and 5 fps, raw packed monochrome alone requires 61.44 kb/s.

The browser probes VP8 and H.264 encode/decode support at runtime. In a separate Chromium experiment, 25 frames at 128 × 96 and 5 fps with a 4 kb/s real-time target and a keyframe every ten frames produced 1.89 kb/s VP8 and 1.72 kb/s H.264 for a moving rectangle. A seeded, changing colour texture produced 73.1 and 157.7 kb/s respectively, before modem overhead. Even the smallest tested moving-rectangle keyframe would exceed 200 ms as a standalone Sonance packet. Colour and temporal coding are deferred until measured link capacity justifies batching and keyframe recovery.

SonicVision uses the unmodified upstream WASM crate with default features, Rust 1.93.1, wasm-bindgen CLI 0.2.125 and the [checked-in Cargo lockfile](Cargo.lock). The upstream crate is excluded from its workspace and needs its own lockfile. To reproduce from the pinned source checkout with the matching Rust target and CLI installed, copy this lockfile to `sonance-wasm/Cargo.lock` in that checkout, then run:

```sh
cargo build --manifest-path sonance-wasm/Cargo.toml --locked --release --target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir /path/to/SonicVision/docs/modem sonance-wasm/target/wasm32-unknown-unknown/release/sonance_wasm.wasm
```

[Sonance licence](../docs/modem/LICENSE-sonance.txt) · [Dependency notices](../docs/modem/THIRD-PARTY.txt)

## Verification

- Node 26.12.0 passed all six `npm test` checks. The sustained test recovered 100/100 packets after a 48 → 44.1 → 48 kHz PCM conversion. The seeded noise test recovered the exact bytes at 20 dB SNR.
- Chromium and macOS Safari passed GitHub Pages digital loopback. WebKit passed loopback at an emulated iPhone viewport. Chromium also passed fake-camera capture and muted benchmark playback. A Chromium file-backed fake microphone delivered zero packets. A separate synthetic MediaStream through the actual AudioWorklet and decoder recovered all 19 supplied packets out of 20 expected, with one deliberate omission, no modem errors and no capture gaps.
- A local mkcert HTTPS smoke test returned HTTP 200 with certificate validation and HTTP 404 for a private-key path. Physical Mac ↔ iPhone audio and iOS certificate installation remain unmeasured.
