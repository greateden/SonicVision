# SonicVision

Send live monochrome video through a speaker to another device’s microphone. Everything runs in the browser. Hosting serves the app files only.

## Run

Open [SonicVision on GitHub Pages](https://greateden.github.io/SonicVision/) on both devices, or run `npm start` with Node.js 22+ and open `http://localhost:8080` on your Mac. **Digital loopback** tests the full codec silently, with no permissions when using the synthetic source.

## Try it on two devices

1. Place your Mac and iPhone close together in a quiet room. Keep both tabs open and disconnect headphones.
2. Choose **Listen** on one device and allow microphone access. On the other, start with **Synthetic**, **32 × 24** and **1 fps**. Click **Transmit** at low volume. Raise the volume gradually if needed.
3. Try **Camera**, then swap roles. For a repeatable test, use **Send benchmark** while the other device listens. Record the result out of 20 packets for each direction, along with distance, volume and the microphone settings under **Device diagnostics**.

Bitrate and frame rate use a rolling five-second window. Video loss counts gaps between received sequence numbers. Benchmark loss includes all 20 expected packets once any packet is heard. Latency is capture-to-display using the two device clocks, so sync them for an estimate.

## Local HTTPS on iPhone

Install `mkcert` with `brew install mkcert` using the official [Homebrew formula](https://formulae.brew.sh/formula/mkcert). On your Mac, replace the example IP with its LAN address. [Official mkcert project](https://github.com/FiloSottile/mkcert)

```sh
mkcert -install
mkdir -p .tls
mkcert -cert-file .tls/site.pem -key-file .tls/site-key.pem 192.168.1.10
TLS_CERT=.tls/site.pem TLS_KEY=.tls/site-key.pem npm start
```

AirDrop only `rootCA.pem` from the directory printed by `mkcert -CAROOT`. Install its profile and enable full trust on your iPhone, then open `https://192.168.1.10:8080` on the same LAN. Keep both private keys on the Mac. [Apple’s certificate trust steps](https://support.apple.com/en-us/102390)

## Limits

In digital tests, worst-case frames reached an airtime ceiling of **0.92 fps at 64 × 48** and **0.33 fps at 128 × 96**, including a 140 ms guard. Simpler images compress smaller. The frame-rate control sets a ceiling and the sender waits for each packet before taking the next frame. Mac ↔ iPhone acoustic performance still needs measurement. Run `npm test` for PCM verification or see the [modem comparison](modem/README.md).
