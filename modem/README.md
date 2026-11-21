# Modem build and verification

[Sonance](https://github.com/sjqtentacles/sonance) is pinned to `c483e3336f76cbf37abbeb6403659da87be5c157`. Upstream superframes pack multiple fountain symbols behind one PHY preamble, and its stream wrapper releases the completed file. SonicVision instead packs one, four or eight numbered test records into a single CRC-protected PHY payload and releases each batch as soon as the PHY validates it. Each batch has a preamble. The sender schedules PCM on a single sample clock with Sonance's 512-sample inter-frame gap in the experimental profiles. Balanced retains the 140 ms control. Auto experiments specify matching modulation/FEC rungs manually at both ends.

The [source patch](sonance-auto.patch) exposes the Auto rungs and the sample index of each validated frame's end. It also preserves buffered audio for reacquisition when a truncated PHY frame fails its CRC, and skips repeated demodulation while waiting for the end declared in a validated header.

To rebuild with Rust 1.93.1, the `wasm32-unknown-unknown` target and wasm-bindgen CLI 0.2.125, use a clean checkout at the pinned commit. From that checkout, set `SONICVISION` to the absolute path of this repository and run:

```sh
git apply "$SONICVISION/modem/sonance-auto.patch"
cp "$SONICVISION/modem/Cargo.lock" sonance-wasm/Cargo.lock
cargo build --manifest-path sonance-wasm/Cargo.toml --locked --release --target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir "$SONICVISION/docs/modem" sonance-wasm/target/wasm32-unknown-unknown/release/sonance_wasm.wasm
```

[Sonance licence](../docs/modem/LICENSE-sonance.txt) · [Dependency notices](../docs/modem/THIRD-PARTY.txt)

## Verification

The table uses 256-byte records and a 60-second generated PCM sample window. All five tests recovered every scheduled packet. The shorter-gap profiles also recovered the first intact packet after a truncation and a later erasure in a separate incremental test.

| Sonance profile | Records per preamble | Valid PHY packets | Useful kb/s | Waveform per packet |
| --- | ---: | ---: | ---: | ---: |
| Balanced | 1 | 68 / 68 | 2.32 | 733 ms |
| FastWide with 44.1 kHz capture conversion | 4 | 53 / 53 | 7.24 | 1,113 ms |
| Auto rung 4 with 44.1 kHz capture conversion | 8 | 59 / 59 | 16.11 | 1,000 ms |
| Auto rung 6 | 1 | 227 / 227 | 7.75 | 253 ms |
| Auto rung 6 | 8 | 75 / 75 | 20.48 | 787 ms |

A larger batch buys useful bitrate at the cost of delivery latency. Acoustic compressed video remains gated on direction-specific hardware evidence. The paired benchmark is ready to run, with Mac ↔ iPhone over-air results pending.

## Bounded Cyrinx WASM probe

The optional probe builds the portable bulk PHY and double-precision KissFFT backend from [Cyrinx](https://github.com/dweekly/cyrinx) at `cba849ed8eafdc06362b390dd9919c54ca99ce53` (Apache-2.0 plus upstream notices). It uses a fixed 32,768-sample input buffer and checks the upstream `qam16_r34` Python golden vectors. A [WASI SDK](https://github.com/WebAssembly/wasi-sdk) clang is required for this experiment only.

```sh
node modem/run-cyrinx-probe.mjs /path/to/pinned/cyrinx /path/to/wasi-sdk/bin/clang
```

WASI SDK 34 built a module that matched all 23,040 golden TX samples and recovered all four CRC-valid RX blocks (1,024 bytes) from both clean PCM and the upstream 28,300-sample multipath fixture. The same module passed in Node 26 and WebKit 27.2. This is a bounded bulk decode. The application ships only Sonance.
