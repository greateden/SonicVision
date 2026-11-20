/**
 * [`WasmMultiStreamDecoder::take_completed`]. wasm-bindgen can't return a
 * `(u16, Vec<u8>)` tuple, so we wrap it.
 */
export class WasmCompletedTransfer {
    static __wrap(ptr) {
        const obj = Object.create(WasmCompletedTransfer.prototype);
        obj.__wbg_ptr = ptr;
        WasmCompletedTransferFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmCompletedTransferFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmcompletedtransfer_free(ptr, 0);
    }
    /**
     * The fully reconstructed payload (clones out of the wrapper).
     * @returns {Uint8Array}
     */
    payload() {
        const ret = wasm.wasmcompletedtransfer_payload(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * The sender's 16-bit id (matches the `source_id` it encoded with).
     * @returns {number}
     */
    source_id() {
        const ret = wasm.wasmcompletedtransfer_source_id(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmCompletedTransfer.prototype[Symbol.dispose] = WasmCompletedTransfer.prototype.free;

export class WasmDecoder {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmDecoderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmdecoder_free(ptr, 0);
    }
    /**
     * Total frames the decoder has acquired (decoded + failed) since
     * construction — a "did I hear anything at all" counter for the UI.
     * @returns {number}
     */
    frames_detected() {
        const ret = wasm.wasmdecoder_frames_detected(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {string} profile
     * @param {number | null} [rung]
     */
    constructor(profile, rung) {
        const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdecoder_new(ptr0, len0, isLikeNone(rung) ? 0xFFFFFF : rung);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmDecoderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Feed captured PCM (any chunking, e.g. one AudioWorklet block). Drains the
     * decoder's events, queuing any decode *failures* (chirp found, frame bad)
     * so the UI can distinguish "heard nothing" from "heard but couldn't
     * decode," and counting every detected frame for a diagnostic readout.
     * @param {Float32Array} pcm
     */
    push(pcm) {
        const ptr0 = passArrayF32ToWasm0(pcm, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.wasmdecoder_push(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Lower (or raise) the chirp acquisition thresholds for a weak/strong
     * signal. `abs` is the minimum normalized-correlation peak, `ratio` how far
     * it must exceed the local mean. Defaults are `(0.12, 3.0)`; the live mic
     * path lowers them since real speaker/mic capture attenuates the signal.
     * @param {number} abs
     * @param {number} ratio
     */
    set_detect_threshold(abs, ratio) {
        wasm.wasmdecoder_set_detect_threshold(this.__wbg_ptr, abs, ratio);
    }
    /**
     * Pop the next decode *failure* description (e.g. `"PayloadCrc"`), or `None`
     * if none occurred. A failure means a chirp was acquired but the frame
     * didn't decode — surfacing it is what makes the demo say "heard a frame
     * but couldn't decode" instead of looking dead.
     * @returns {string | undefined}
     */
    take_failure() {
        const ret = wasm.wasmdecoder_take_failure(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Return the next fully decoded message, or `None` (`undefined` in JS) if
     * none is ready yet.
     * @returns {Uint8Array | undefined}
     */
    take_message() {
        const ret = wasm.wasmdecoder_take_message(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
}
if (Symbol.dispose) WasmDecoder.prototype[Symbol.dispose] = WasmDecoder.prototype.free;

/**
 * The result of probing the channel from a sounding frame: the SNR the
 * receiver measured and the rate-ladder rung it would select (its human label,
 * QAM order, and code rate as a percentage). Drives the "climbing rate ladder"
 * widget.
 */
export class WasmLinkProbe {
    static __wrap(ptr) {
        const obj = Object.create(WasmLinkProbe.prototype);
        obj.__wbg_ptr = ptr;
        WasmLinkProbeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmLinkProbeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmlinkprobe_free(ptr, 0);
    }
    /**
     * FEC code rate of the selected rung, in percent (e.g. 50 for r1/2).
     * @returns {number}
     */
    code_rate_pct() {
        const ret = wasm.wasmlinkprobe_code_rate_pct(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * QAM constellation order (4, 16, 64, ...) of the selected rung.
     * @returns {number}
     */
    qam_order() {
        const ret = wasm.wasmlinkprobe_qam_order(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Human-readable rung name (e.g. `"16-QAM r1/2"`).
     * @returns {string}
     */
    rung_label() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmlinkprobe_rung_label(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Post-equalization SNR (dB) measured from the sounding frame's pilots.
     * @returns {number}
     */
    snr_db() {
        const ret = wasm.wasmlinkprobe_snr_db(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmLinkProbe.prototype[Symbol.dispose] = WasmLinkProbe.prototype.free;

/**
 * Multi-sender streaming receiver: decodes PHY frames from a shared capture
 * stream and routes each frame's payload to a per-`source_id` fountain
 * reassembly context, so several devices transmitting into the same room are
 * reconstructed independently. This is the receive side of the "acoustic
 * AirDrop" product — it drives the per-source progress UI.
 */
export class WasmMultiStreamDecoder {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmMultiStreamDecoderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmmultistreamdecoder_free(ptr, 0);
    }
    /**
     * Number of distinct senders currently mid-transfer (for a live
     * "N devices sending" indicator).
     * @returns {number}
     */
    active_sources() {
        const ret = wasm.wasmmultistreamdecoder_active_sources(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Total frames acquired (decoded + failed) since construction.
     * @returns {number}
     */
    frames_detected() {
        const ret = wasm.wasmmultistreamdecoder_frames_detected(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {string} profile
     */
    constructor(profile) {
        const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmultistreamdecoder_new(ptr0, len0);
        this.__wbg_ptr = ret;
        WasmMultiStreamDecoderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Feed captured PCM. Decodes completed frames and advances every active
     * sender's fountain reconstruction; finished transfers queue up for
     * [`Self::take_completed`]. Per-frame failures are counted and queued.
     * @param {Float32Array} pcm
     */
    push(pcm) {
        const ptr0 = passArrayF32ToWasm0(pcm, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.wasmmultistreamdecoder_push(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Lower/raise the chirp acquisition thresholds (see
     * [`WasmDecoder::set_detect_threshold`]).
     * @param {number} abs
     * @param {number} ratio
     */
    set_detect_threshold(abs, ratio) {
        wasm.wasmmultistreamdecoder_set_detect_threshold(this.__wbg_ptr, abs, ratio);
    }
    /**
     * Treat each decoded PHY-frame payload as a packed batch of transport
     * packets (a superframe) and re-split it before routing to the per-source
     * demux. Pair with [`encode_superstream_from`].
     * @param {boolean} enabled
     */
    set_superframes(enabled) {
        wasm.wasmmultistreamdecoder_set_superframes(this.__wbg_ptr, enabled);
    }
    /**
     * Pop the next completed transfer, or `None` (`undefined` in JS) if none is
     * ready. Call in a loop after each `push`.
     * @returns {WasmCompletedTransfer | undefined}
     */
    take_completed() {
        const ret = wasm.wasmmultistreamdecoder_take_completed(this.__wbg_ptr);
        return ret === 0 ? undefined : WasmCompletedTransfer.__wrap(ret);
    }
    /**
     * Pop the next frame decode failure description, or `None`.
     * @returns {string | undefined}
     */
    take_failure() {
        const ret = wasm.wasmmultistreamdecoder_take_failure(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
}
if (Symbol.dispose) WasmMultiStreamDecoder.prototype[Symbol.dispose] = WasmMultiStreamDecoder.prototype.free;

/**
 * Streaming file receiver: decodes PHY frames and feeds their payloads to the
 * RaptorQ transport until the whole file is reconstructed.
 */
export class WasmStreamDecoder {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmStreamDecoderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmstreamdecoder_free(ptr, 0);
    }
    /**
     * Total frames acquired (decoded + failed) since construction.
     * @returns {number}
     */
    frames_detected() {
        const ret = wasm.wasmstreamdecoder_frames_detected(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Whether the full payload has been reconstructed.
     * @returns {boolean}
     */
    is_complete() {
        const ret = wasm.wasmstreamdecoder_is_complete(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} profile
     */
    constructor(profile) {
        const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmstreamdecoder_new(ptr0, len0);
        this.__wbg_ptr = ret;
        WasmStreamDecoderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Feed captured PCM. Internally decodes any completed frames and advances
     * the fountain reconstruction. Frame-level decode failures are counted and
     * queued (the fountain's repair frames make the transfer robust to them),
     * so the UI can report "N frames dropped" without aborting.
     * @param {Float32Array} pcm
     */
    push(pcm) {
        const ptr0 = passArrayF32ToWasm0(pcm, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.wasmstreamdecoder_push(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Lower/raise the chirp acquisition thresholds (see
     * [`WasmDecoder::set_detect_threshold`]).
     * @param {number} abs
     * @param {number} ratio
     */
    set_detect_threshold(abs, ratio) {
        wasm.wasmstreamdecoder_set_detect_threshold(this.__wbg_ptr, abs, ratio);
    }
    /**
     * Treat each decoded PHY-frame payload as a packed batch of transport
     * packets (a superframe) and re-split it before feeding the transport.
     * Pair with [`encode_superstream`] / [`encode_superstream_adaptive`].
     * @param {boolean} enabled
     */
    set_superframes(enabled) {
        wasm.wasmstreamdecoder_set_superframes(this.__wbg_ptr, enabled);
    }
    /**
     * Take the reconstructed payload once complete (consumes it).
     * @returns {Uint8Array | undefined}
     */
    take() {
        const ret = wasm.wasmstreamdecoder_take(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Pop the next frame decode failure description, or `None`. Useful for a
     * "dropped frames" diagnostic; the fountain repair usually recovers anyway.
     * @returns {string | undefined}
     */
    take_failure() {
        const ret = wasm.wasmstreamdecoder_take_failure(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
}
if (Symbol.dispose) WasmStreamDecoder.prototype[Symbol.dispose] = WasmStreamDecoder.prototype.free;

/**
 * The batch size [`encode_superstream_adaptive`] would choose for this link, so
 * the UI can display "packing N packets/frame" without re-deriving the policy.
 * @param {number} snr_db
 * @param {number} repair_per_block
 * @returns {number}
 */
export function adaptive_batch_size(snr_db, repair_per_block) {
    const ret = wasm.adaptive_batch_size(snr_db, repair_per_block);
    return ret >>> 0;
}

/**
 * Normalized chirp matched-filter peak of `pcm` against `profile`'s preamble,
 * in `[0, 1]`. High (> ~0.5) when a real frame's chirp is present, low
 * (< ~0.2) on unrelated noise. The demo polls this per audio block to drive a
 * live "signal present" meter, so the user can see the transmission arriving
 * even before (or instead of) a full frame decodes.
 * @param {string} profile
 * @param {Float32Array} pcm
 * @returns {number}
 */
export function chirp_strength(profile, pcm) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(pcm, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.chirp_strength(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * Equalized data-carrier constellation for the *first* decodable OFDM symbol
 * found in `pcm`: a flat `[re0, im0, re1, im1, ...]` buffer of post-
 * equalization I/Q points (pilots excluded). Empty if no frame is located.
 * Drives the live constellation scatter — the points tighten into clean QAM
 * clusters as SNR climbs, the most visceral "is the link healthy" view.
 * @param {string} profile
 * @param {Float32Array} pcm
 * @returns {Float32Array}
 */
export function constellation(profile, pcm) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(pcm, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.constellation(ptr0, len0, ptr1, len1);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Encode a short message into PCM samples to play out the speaker.
 * @param {string} profile
 * @param {Uint8Array} bytes
 * @param {number | null} [rung]
 * @returns {Float32Array}
 */
export function encode(profile, bytes, rung) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encode(ptr0, len0, ptr1, len1, isLikeNone(rung) ? 0xFFFFFF : rung);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Fountain-encode `bytes` into a flat PCM buffer of concatenated frames (each
 * transport packet, separated by a short silent gap) ready to play in one go.
 * `repair_per_block` extra repair symbols buy tolerance to lost/garbled frames
 * — the receiver reconstructs from any sufficient subset.
 * @param {string} profile
 * @param {Uint8Array} bytes
 * @param {number} repair_per_block
 * @param {number} mtu
 * @returns {Float32Array}
 */
export function encode_stream(profile, bytes, repair_per_block, mtu) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encode_stream(ptr0, len0, ptr1, len1, repair_per_block, mtu);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Like [`encode_stream`], but stamps every transport packet with `source_id`
 * so multiple devices can transmit at once and a [`WasmMultiStreamDecoder`]
 * can attribute each reconstructed payload to its sender. Pick a distinct id
 * per device (e.g. a random `u16` chosen on page load).
 * @param {string} profile
 * @param {Uint8Array} bytes
 * @param {number} repair_per_block
 * @param {number} mtu
 * @param {number} source_id
 * @returns {Float32Array}
 */
export function encode_stream_from(profile, bytes, repair_per_block, mtu, source_id) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encode_stream_from(ptr0, len0, ptr1, len1, repair_per_block, mtu, source_id);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Superframe variant of [`encode_stream`]: packs `packets_per_frame` transport
 * packets behind each preamble to amortize it. Pair with a
 * [`WasmStreamDecoder`] in superframe mode ([`WasmStreamDecoder::set_superframes`]).
 * @param {string} profile
 * @param {Uint8Array} bytes
 * @param {number} repair_per_block
 * @param {number} mtu
 * @param {number} packets_per_frame
 * @returns {Float32Array}
 */
export function encode_superstream(profile, bytes, repair_per_block, mtu, packets_per_frame) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encode_superstream(ptr0, len0, ptr1, len1, repair_per_block, mtu, packets_per_frame);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Like [`encode_superstream`], but the batch size is chosen by the
 * loss-margin-driven [`adaptive_packets_per_frame`](sonance::stream::adaptive_packets_per_frame)
 * from the measured link `snr_db` and the repair margin — the browser
 * equivalent of the native `Auto` adaptive path. Returns the PCM; query
 * [`adaptive_batch_size`] for the batch it picked if you want to show it.
 * @param {string} profile
 * @param {Uint8Array} bytes
 * @param {number} repair_per_block
 * @param {number} mtu
 * @param {number} snr_db
 * @returns {Float32Array}
 */
export function encode_superstream_adaptive(profile, bytes, repair_per_block, mtu, snr_db) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encode_superstream_adaptive(ptr0, len0, ptr1, len1, repair_per_block, mtu, snr_db);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Source-stamped superframe encode: like [`encode_superstream`], but stamps
 * every packet with `source_id` so a [`WasmMultiStreamDecoder`] (in superframe
 * mode) can attribute the transfer. The multi-sender, batched path.
 * @param {string} profile
 * @param {Uint8Array} bytes
 * @param {number} repair_per_block
 * @param {number} mtu
 * @param {number} source_id
 * @param {number} packets_per_frame
 * @returns {Float32Array}
 */
export function encode_superstream_from(profile, bytes, repair_per_block, mtu, source_id, packets_per_frame) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encode_superstream_from(ptr0, len0, ptr1, len1, repair_per_block, mtu, source_id, packets_per_frame);
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}

/**
 * Probe a captured sounding frame (see the native `Auto` path): locate it,
 * measure SNR, and report the rate-ladder rung the link would climb to. The
 * demo plays a sounding tone, captures it, and shows the ladder lighting up to
 * the chosen rung. Returns `None` if no sounding frame is found.
 * @param {string} profile
 * @param {Float32Array} pcm
 * @returns {WasmLinkProbe | undefined}
 */
export function probe_link(profile, pcm) {
    const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(pcm, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.probe_link(ptr0, len0, ptr1, len1);
    return ret === 0 ? undefined : WasmLinkProbe.__wrap(ret);
}

/**
 * Codec/playback sample rate. Browsers must open the `AudioContext` at this
 * rate so encoded PCM plays back at the pitch the decoder expects.
 * @returns {number}
 */
export function sample_rate() {
    const ret = wasm.sample_rate();
    return ret >>> 0;
}

/**
 * A short-time-Fourier spectrogram of `pcm`: `cols` time slices, each the
 * magnitude (in dB, floored at -80) of an `fft_size`-point FFT over a Hann-
 * windowed, 50%-overlapped frame. Returned flat, row-major as
 * `cols * (fft_size/2)` values in `[0, 1]` (already normalized for a heatmap),
 * so JS can paint it straight into a `<canvas>` ImageData without re-scaling.
 * `bins_per_col = fft_size / 2`. The demo drives a live waterfall from the same
 * captured audio the decoder consumes — the "see the data in the air" view.
 * @param {Float32Array} pcm
 * @param {number} fft_size
 * @param {number} cols
 * @returns {Float32Array}
 */
export function spectrogram(pcm, fft_size, cols) {
    const ptr0 = passArrayF32ToWasm0(pcm, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.spectrogram(ptr0, len0, fft_size, cols);
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Number of frequency bins per spectrogram column for a given `fft_size`
 * (`= fft_size.next_power_of_two() / 2`). The JS waterfall needs this to lay
 * out the flat buffer [`spectrogram`] returns.
 * @param {number} fft_size
 * @returns {number}
 */
export function spectrogram_bins(fft_size) {
    const ret = wasm.spectrogram_bins(fft_size);
    return ret >>> 0;
}

/**
 * Number of transport packets [`encode_stream`] would emit — useful for a
 * progress/ETA display in the UI.
 * @param {Uint8Array} bytes
 * @param {number} repair_per_block
 * @param {number} mtu
 * @returns {number}
 */
export function stream_packet_count(bytes, repair_per_block, mtu) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.stream_packet_count(ptr0, len0, repair_per_block, mtu);
    return ret >>> 0;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_ea4887a5f8f9a9db: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./sonance_wasm_bg.js": import0,
    };
}

const WasmCompletedTransferFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmcompletedtransfer_free(ptr, 1));
const WasmDecoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmdecoder_free(ptr, 1));
const WasmLinkProbeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmlinkprobe_free(ptr, 1));
const WasmMultiStreamDecoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmmultistreamdecoder_free(ptr, 1));
const WasmStreamDecoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmstreamdecoder_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('sonance_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
