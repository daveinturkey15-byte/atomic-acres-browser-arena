#!/usr/bin/env python3
"""Create Atomic Acres' original Sanctified Frag choir sting.

The waveform is deterministic additive/formant synthesis. It uses no sampled
voice, commercial recording, downloaded sound effect, or external model.
"""

from __future__ import annotations

import hashlib
import math
import wave
from pathlib import Path

import numpy as np

PROJECT = Path(__file__).resolve().parents[2]
OUTPUT = PROJECT / "public/assets/original/audio/sanctified-frag-hallelujah.wav"
SAMPLE_RATE = 22_050
DURATION = 3.55
RNG = np.random.default_rng(0x5A4E4354)

# Four syllables: HAL — le — LU — jah. Chord voicings deliberately resolve
# from C through A minor and G back to a broad final C-major sonority.
SYLLABLES = (
    (0.04, 0.88, "ah", (130.81, 196.00, 261.63, 329.63)),
    (0.78, 0.82, "eh", (110.00, 164.81, 220.00, 261.63)),
    (1.45, 1.04, "oo", (98.00, 196.00, 246.94, 392.00)),
    (2.36, 1.10, "ah", (130.81, 196.00, 261.63, 523.25)),
)

FORMANTS = {
    "ah": ((760.0, 1.00, 115.0), (1160.0, 0.72, 150.0), (2860.0, 0.30, 260.0)),
    "eh": ((530.0, 1.00, 95.0), (1840.0, 0.78, 180.0), (2480.0, 0.34, 230.0)),
    "oo": ((350.0, 1.00, 80.0), (820.0, 0.75, 120.0), (2180.0, 0.24, 230.0)),
}


def smooth_envelope(length: int, attack: float, release: float) -> np.ndarray:
    envelope = np.ones(length, dtype=np.float64)
    attack_samples = max(1, min(length, int(attack * SAMPLE_RATE)))
    release_samples = max(1, min(length, int(release * SAMPLE_RATE)))
    envelope[:attack_samples] = np.sin(np.linspace(0.0, math.pi / 2.0, attack_samples)) ** 2
    envelope[-release_samples:] *= np.sin(np.linspace(math.pi / 2.0, 0.0, release_samples)) ** 2
    return envelope


def formant_voice(fundamental: float, vowel: str, seconds: float, detune_cents: float, phase_seed: float) -> np.ndarray:
    length = int(seconds * SAMPLE_RATE)
    time = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    vibrato = 0.0032 * np.sin(2.0 * math.pi * (5.05 + phase_seed * 0.08) * time + phase_seed)
    phase_time = time + np.cumsum(vibrato) / SAMPLE_RATE
    detuned = fundamental * (2.0 ** (detune_cents / 1200.0))
    voice = np.zeros(length, dtype=np.float64)
    harmonic_limit = min(52, int((SAMPLE_RATE * 0.47) / detuned))
    for harmonic in range(1, harmonic_limit + 1):
        frequency = detuned * harmonic
        resonance = 0.055
        for formant, strength, width in FORMANTS[vowel]:
            resonance += strength * math.exp(-0.5 * ((frequency - formant) / width) ** 2)
        amplitude = resonance / (harmonic ** 1.16)
        phase = phase_seed * 1.73 + harmonic * 0.41
        voice += amplitude * np.sin(2.0 * math.pi * frequency * phase_time + phase)
    breath = RNG.normal(0.0, 1.0, length)
    breath = np.convolve(breath, np.ones(7) / 7.0, mode="same")
    voice += breath * 0.017
    voice *= smooth_envelope(length, 0.115, 0.20)
    return voice


def add_delayed(destination: np.ndarray, source: np.ndarray, delay_seconds: float, gain: float) -> None:
    delay = int(delay_seconds * SAMPLE_RATE)
    if delay >= len(destination):
        return
    length = min(len(source), len(destination) - delay)
    destination[delay : delay + length] += source[:length] * gain


def main() -> None:
    total_samples = int(DURATION * SAMPLE_RATE)
    dry_left = np.zeros(total_samples, dtype=np.float64)
    dry_right = np.zeros(total_samples, dtype=np.float64)
    pans = (-0.42, -0.14, 0.14, 0.42)
    voice_levels = (0.82, 0.72, 0.64, 0.58)

    for syllable_index, (start, seconds, vowel, chord) in enumerate(SYLLABLES):
        start_sample = int(start * SAMPLE_RATE)
        for voice_index, fundamental in enumerate(chord):
            combined = np.zeros(int(seconds * SAMPLE_RATE), dtype=np.float64)
            for singer_index, cents in enumerate((-7.0, 0.0, 6.0)):
                combined += formant_voice(
                    fundamental,
                    vowel,
                    seconds,
                    cents + voice_index * 0.35,
                    syllable_index * 0.9 + voice_index * 0.37 + singer_index * 0.21,
                ) * (0.36 if singer_index else 0.43)
            combined *= voice_levels[voice_index]
            end_sample = min(total_samples, start_sample + len(combined))
            combined = combined[: end_sample - start_sample]
            pan = pans[voice_index]
            left_gain = math.sqrt((1.0 - pan) * 0.5)
            right_gain = math.sqrt((1.0 + pan) * 0.5)
            dry_left[start_sample:end_sample] += combined * left_gain
            dry_right[start_sample:end_sample] += combined * right_gain

        # Quiet, breathy H/L onset makes the four vowel blocks read as sung
        # syllables instead of a continuous synthesizer pad.
        consonant_length = int(0.10 * SAMPLE_RATE)
        consonant = RNG.normal(0.0, 1.0, consonant_length)
        consonant = np.convolve(consonant, np.ones(19) / 19.0, mode="same")
        consonant *= smooth_envelope(consonant_length, 0.008, 0.075) * (0.085 if syllable_index == 0 else 0.045)
        end = min(total_samples, start_sample + consonant_length)
        dry_left[start_sample:end] += consonant[: end - start_sample]
        dry_right[start_sample:end] += consonant[: end - start_sample]

    # Small chapel-like deterministic early reflections and a soft opposite-side
    # tail; no convolution asset is required at runtime.
    wet_left = dry_left.copy()
    wet_right = dry_right.copy()
    for delay, gain in ((0.037, 0.23), (0.071, 0.18), (0.113, 0.13), (0.179, 0.09), (0.263, 0.06)):
        add_delayed(wet_left, dry_right, delay, gain)
        add_delayed(wet_right, dry_left, delay * 1.07, gain)

    # Gentle saturation controls harmonic peaks before normalization.
    stereo = np.stack((np.tanh(wet_left * 0.88), np.tanh(wet_right * 0.88)), axis=1)
    stereo *= smooth_envelope(total_samples, 0.025, 0.22)[:, None]
    peak = float(np.max(np.abs(stereo)))
    if peak <= 0:
        raise RuntimeError("Generated choir is silent")
    stereo *= 0.88 / peak
    pcm = np.round(stereo * 32767.0).astype("<i2")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())

    digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    rms = float(np.sqrt(np.mean(stereo**2)))
    print(f"SANCTIFIED_FRAG_CHOIR_READY path={OUTPUT}")
    print(f"sample_rate={SAMPLE_RATE} duration={DURATION:.2f} peak={float(np.max(np.abs(stereo))):.4f} rms={rms:.4f}")
    print(f"bytes={OUTPUT.stat().st_size} sha256={digest}")


if __name__ == "__main__":
    main()
