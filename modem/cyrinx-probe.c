#include <stdint.h>
#include "cyrinx/cyrinx_bulk.h"

// Fixed qam16_r34 geometry from Cyrinx's upstream golden-vector manifest.
static const cyrinx_bulk_config config = {
    .f_lo = 1101.5625, .f_hi = 22992.1875, .pilot_every = 8, .bits_per_bin = 4,
    .rate = "3/4", .n_sym = 4, .nfft = 2048, .cp = 768, .sr = 48000,
    .amp = 0.5, .clip_sigma = 3.3, .chirp_f0 = 2000, .chirp_f1 = 16000,
};
static uint8_t payload[1024];
static float pcm[32768];

uint8_t *probe_payload(void) { return payload; }
float *probe_pcm(void) { return pcm; }
int probe_encode(void) {
    return (int)cyrinx_bulk_modulate(&config, payload, sizeof(payload), pcm, 32768, 0);
}
int probe_decode(int samples) {
    int ok = 0;
    int total = 0;
    if (samples < 0 || samples > 32768) return -1;
    long result = cyrinx_bulk_demodulate(&config, pcm, samples, payload, sizeof(payload), &ok, &total, 0);
    return result == sizeof(payload) && total == 4 ? ok : -1;
}
