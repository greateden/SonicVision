# SonicVision

Send low-resolution video through a speaker to another device’s microphone. The browser handles video and audio. Hosting serves the app files only.

## Run

Open [SonicVision on GitHub Pages](https://greateden.github.io/SonicVision/) on both devices, or run `npm start` with Node.js 22+ and open `http://localhost:8080` on your Mac. **Digital loopback** tests the full codec silently, with no permissions when using the synthetic source.

## Try it on two devices

1. Place your Mac and iPhone close together in a quiet room. Keep both tabs open and disconnect headphones.
2. Choose **Listen** on one device and allow microphone access. On the other, start with **Synthetic**, **32 × 24 colour** and **1 fps**. Click **Transmit** at low volume. Raise the volume gradually if needed. For a smaller payload, try **32 × 24 monochrome**. Use the same app version on both devices for colour.
3. Try **Camera**, then swap roles. For a repeatable test, use **Send benchmark** while the other device listens. Record the result out of 20 packets for each direction, along with distance, volume and the microphone settings under **Device diagnostics**.

Bitrate and frame rate use a rolling five-second window. Video loss counts gaps between received sequence numbers. Benchmark loss includes all 20 expected packets once any packet is heard. Latency is capture-to-display using the two device clocks, so sync them for an estimate.

## Local HTTPS on iPhone

Camera and microphone access on the LAN requires a browser-trusted HTTPS origin. The GitHub Pages version supplies one. `npm start` serves HTTP on localhost by default for use on the Mac itself. The audio signal between the devices travels through the air in either setup.

If you already have `.tls/site.pem` and `.tls/site-key.pem`, start with `npm run start:lan`. The server prints the actual LAN addresses covered by the certificate. Keep the terminal running while testing.

To create the files, install `mkcert` with `brew install mkcert` using the [Homebrew formula](https://formulae.brew.sh/formula/mkcert). On your Mac, find the current Wi-Fi IP address in System Settings → Wi-Fi → Details. Replace the example IP in the command below. `mkcert -install` creates and trusts a local development certificate authority on the Mac. The next `mkcert` command issues a certificate for the given IP. [Official mkcert project](https://github.com/FiloSottile/mkcert)

```sh
mkcert -install
mkdir -p .tls
mkcert -cert-file .tls/site.pem -key-file .tls/site-key.pem 192.168.1.10
npm run start:lan
```

AirDrop only `rootCA.pem` from the directory printed by `mkcert -CAROOT`. Install its profile and enable full trust on your iPhone, then open the printed Wi-Fi HTTPS address in Safari while on the same LAN. Keep `rootCA-key.pem` and `site-key.pem` on the Mac. [Apple’s certificate trust steps](https://support.apple.com/en-us/102390)

- If Safari times out, confirm the server is still running, both devices are on the same LAN, and the Mac firewall allows the connection. Guest Wi-Fi can block traffic between devices.
- If Safari shows a certificate error, check iPhone root trust and the exact IP in the address bar. If the Mac’s Wi-Fi IP changed, issue a new site certificate for that address and restart the server.
- If the page loads but camera or microphone access fails, check Safari’s site permissions. A plain HTTP LAN URL disables these controls.

## Limits

The colour mode uses 8 bits per pixel (3 red, 3 green, 2 blue). Each frame is independent. In PCM tests, a 768-byte raw colour frame had a **0.58 fps** airtime ceiling and a 24-byte run-length example had a **2.24 fps** ceiling, both including the 140 ms guard. Raw monochrome frames had ceilings of **0.92 fps at 64 × 48** and **0.33 fps at 128 × 96**. The selected frame rate is an upper bound. Mac ↔ iPhone acoustic performance still needs measurement. Run `npm test` for PCM verification or see the [modem comparison](modem/README.md).
