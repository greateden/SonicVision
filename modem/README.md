# Modem choice

The comparison used the upstream source commits below.

| Modem | Implementation and browser fit | Evidence and streaming |
| --- | --- | --- |
| [Sonance](https://github.com/sjqtentacles/sonance) · MIT · `c483e3336f76cbf37abbeb6403659da87be5c157` | Rust OFDM with LDPC and existing wasm-bindgen exports. The demo uses Web Audio and ScriptProcessor with a fixed 48 kHz assumption. SonicVision uses AudioWorklet and resamples microphone PCM when needed. | Upstream reports simulated 1 KB goodput of 2.5 kb/s for Balanced, 3.6 kb/s for Balanced superframes and 15.0 kb/s for Auto superframes at 32 dB AWGN. Its inspected field-results table is pending. The single-packet `encode` and incremental `WasmDecoder.push` suit live frames. Fountain APIs emit completed transfers and add buffering and redundancy. |
| [Cyrinx](https://github.com/dweekly/cyrinx) · Apache-2.0 with NOTICE · `cba849ed8eafdc06362b390dd9919c54ca99ce53` | Portable C codecs and native audio harnesses. Bulk and batch C APIs take PCM buffers. A browser port could compile the DSP subset with Emscripten and the vendored double-precision KissFFT backend, excluding Apple Accelerate and native transport timing/sleep. It would need exported buffers/functions and browser-side acquisition/framing around the bulk decoder. This port was assessed from source. | Upstream reports 65.875 kb/s verified payload for a specific Mac → Pixel recording/replay schedule and historical native iPhone results of 36.57 kb/s Mac → iPhone and 16.87 kb/s the other way. These runs use different native/offline paths. Its stream IDs belong to the native transport API. |
| [Sonic Transfer](https://github.com/arashtabaa/sonic-transfer) · MIT with notices · `30b643e3ccbdb192d0e527ab291eb3172dacc57b` | Browser TypeScript/Nuxt file app. Production waveform code uses MFSK despite the BFSK class name. Experimental multitone paths are separate. | Streaming demodulation feeds a fountain decoder that reconstructs files. The production throughput note describes synthetic PCM-length benchmarks and a future ≥2 kb/s target. No comparable validated Mac ↔ iPhone goodput was found in the inspected documentation. |

SonicVision uses Sonance Balanced, audible OFDM over roughly 1–9 kHz. Each packet carries a complete 1-bit frame, packed raw or with byte-level run lengths, and an application CRC. This keeps latency bounded and the next valid frame restores the image after loss. At 128 × 96 and 5 fps, raw packed monochrome alone requires 61.44 kb/s. At the measured 0.33 fps worst-case ceiling, colour would add load and inter-frame prediction would require a keyframe recovery policy. The app probes VP8 and H.264 encode/decode support at runtime. The probes check API availability for a configuration, with no guarantee of the encoded size per frame.

SonicVision uses the unmodified upstream WASM crate with default features, Rust 1.93.1, wasm-bindgen CLI 0.2.125 and the [checked-in Cargo lockfile](Cargo.lock). The upstream crate is excluded from its workspace and needs its own lockfile. To reproduce from the pinned source checkout with the matching Rust target and CLI installed, copy this lockfile to `sonance-wasm/Cargo.lock` in that checkout, then run:

```sh
cargo build --manifest-path sonance-wasm/Cargo.toml --locked --release --target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir /path/to/SonicVision/docs/modem sonance-wasm/target/wasm32-unknown-unknown/release/sonance_wasm.wasm
```

[Sonance licence](../docs/modem/LICENSE-sonance.txt) · [Dependency notices](../docs/modem/THIRD-PARTY.txt)
