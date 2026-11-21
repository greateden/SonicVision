# SonicVision

SonicVision sends low-resolution video or benchmark records from a speaker to a microphone. The site serves static assets. Video, audio and benchmark data stay in the browser and device-to-device transmission uses sound.

## Run

Use [GitHub Pages](https://greateden.github.io/SonicVision/) for the deployed version. To test this branch, run `npm start` with Node.js 22+ and open `http://localhost:8080` on the Mac. For a second device, serve the same branch over trusted HTTPS. See **Local HTTPS** below.

### Digital colour video

Select **Synthetic**, **64 × 48 colour** and **Automatic**, then run **60 s digital video trial**. It submits a moving four-colour chart with 900 successive image IDs to WebCodecs at 15 fps. The receiver checks packet CRCs, reassembles compressed frames and waits for a keyframe after a dependency gap. The trial counts each ID once when the decoded pixels are drawn, then checks the visible ID, the colour patches and the reassembled bytes' CRC against the encoder output. Try **32 × 24 colour** for the smaller WebCodecs mode or **Camera** for live input. WebCodecs support and performance vary by device.

**Export JSON** saves the actual codec and framing bytes, keyframe sizes, missing IDs, queue peaks, decoder transitions and same-browser capture-to-canvas latency. `videoVerification.syntheticPass` requires all 900 source IDs in the 60-second display window. Legacy RGB332 and monochrome modes are available under **Legacy acoustic bitmap video**.

### Physical acoustic benchmark

1. Open the same build on both devices. Wait for **Offline assets ready** under **Device diagnostics**. Use their built-in speakers and microphones, disable Wi-Fi, cellular and Bluetooth after loading, and keep both pages visible and the devices awake.
2. Choose the same **Direction**, **Separation** and **Sonance PHY** on both devices. Start at 30 cm with **Balanced**, **256 bytes** and **1 record per preamble**. Use a quiet room and note the devices, OS versions, orientation and system volume. Start at low speaker gain.
3. Click **Listen for benchmark** and grant microphone permission. When listening, click **Send 60 s benchmark** on the sender. After the sender finishes, wait two seconds, stop the listener and export JSON from both devices. Keep the two files paired even when the listener received zero packets.
4. Summarise a completed run with `node modem/compare-trial.mjs sender.json receiver.json`. Repeat independently with the roles swapped. Run three trials per direction at 30 cm and again at 1 m for a directional comparison. Use the same procedure to compare FastWide or a matched Auto rung with four or eight records per preamble.

The summary gives CRC- and pattern-verified goodput over the full 60-second sender window, packet loss including leading and trailing gaps, and receiver decoder-release latency. That latency estimates time from the last captured PHY sample to receipt on the browser's main thread. The waveform duration is reported separately. No inter-device clock alignment is required. Record listener capture gaps and sender underruns alongside loss. Compressed WebCodecs video is available in digital loopback while the acoustic link is benchmarked.

## Local HTTPS

If you already have a browser-trusted certificate and key for the Mac's Wi-Fi address in `.tls/site.pem` and `.tls/site-key.pem`, run `npm run start:lan` and use the printed address on both devices.

To create a local certificate with mkcert, see the [official mkcert project](https://github.com/FiloSottile/mkcert) and the [Homebrew formula](https://formulae.brew.sh/formula/mkcert). Replace the example address with your Mac's current Wi-Fi IP. The first command creates and trusts a local development certificate authority on the Mac.

```sh
mkcert -install
mkdir -p .tls
mkcert -cert-file .tls/site.pem -key-file .tls/site-key.pem 192.168.1.10
npm run start:lan
```

Install only the `rootCA.pem` certificate from the directory reported by `mkcert -CAROOT` on the iPhone. Enable full trust and keep both private keys on the Mac. [Apple certificate trust instructions](https://support.apple.com/en-us/102390)

Run `npm test` for transport and simulated PCM tests. See [modem build and verification](modem/README.md) for the measured results and the optional Cyrinx experiment.
