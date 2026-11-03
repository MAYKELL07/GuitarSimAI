import unittest
import pathlib
import tempfile
import wave
from unittest.mock import patch
import numpy as np
import pedalboard as pb
from native.engine import Engine, DEFAULT_TONE, DEFAULT_ORDER


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = Engine()

    def tearDown(self):
        self.engine.stop()

    def test_invalid_controls_and_routing_are_rejected(self):
        with self.assertRaises(ValueError):
            self.engine.configure({"inputGain": float("nan")})
        with self.assertRaises(ValueError):
            self.engine.configure({"order": ["delay"]})
        with self.assertRaises(ValueError):
            self.engine.start(
                {"inputDevice": 0, "outputDevice": 0, "sampleRate": 50000}
            )
        with self.assertRaises(ValueError):
            self.engine.load({"path": "missing.vst3"})

    def test_live_knob_edit_preserves_processor_state(self):
        before = self.engine.board
        reverb = self.engine.blocks["reverb"][0]
        tone = dict(DEFAULT_TONE, reverb=65, delay=48)
        self.engine.configure({"tone": tone})
        self.assertIs(self.engine.board, before)
        self.assertIs(self.engine.blocks["reverb"][0], reverb)
        self.assertAlmostEqual(reverb.wet_level, 0.65, places=5)

    def test_synth_render_has_correct_duration_and_finite_stereo_audio(self):
        self.engine.prepare(
            {
                "notes": [{"string": 1, "fret": 5, "beat": 0, "length": 1}],
                "bars": 2,
                "bpm": 120,
            }
        )
        self.assertEqual(self.engine.sequence.shape, (2, 192000))
        self.assertTrue(np.isfinite(self.engine.sequence).all())
        self.assertGreater(float(np.max(np.abs(self.engine.sequence))), 0.01)
        np.testing.assert_array_equal(self.engine.sequence[0], self.engine.sequence[1])

    def test_callback_routes_chosen_input_and_never_outputs_nan(self):
        e = self.engine
        e.block_size = 256
        e.input_channel = 1
        e.input_buffer = np.zeros((2, 256), np.float32)
        e.mix_buffer = np.zeros((2, 256), np.float32)
        e.block_indices = np.arange(256, dtype=np.int64)
        e.monitor = True
        e.tone = dict(DEFAULT_TONE, drive=0, bypass=list(DEFAULT_ORDER))
        e.output_gain = 0
        e.rebuild()
        data = np.zeros((256, 2), np.float32)
        data[:, 1] = 0.1
        output = np.empty((256, 2), np.float32)
        for _ in range(3):
            e.callback(data, output, 256, None, False)
        self.assertTrue(np.isfinite(output).all())
        self.assertGreater(float(np.max(np.abs(output))), 0.01)
        self.assertLessEqual(float(np.max(np.abs(output))), 1)
        self.assertAlmostEqual(e.input_peak, 0.1, places=5)
        self.assertEqual(e.callback_error, "")
        self.assertEqual(e.xruns, 0)

    def test_callback_mutes_invalid_plugin_output(self):
        e = self.engine
        e.block_size = 256
        e.input_channel = 0
        e.input_buffer = np.zeros((2, 256), np.float32)
        e.mix_buffer = np.zeros((2, 256), np.float32)
        e.block_indices = np.arange(256, dtype=np.int64)

        class Broken:
            def process(self, *args, **kwargs):
                return np.full((2, 256), np.nan, np.float32)

        e.board = Broken()
        output = np.ones((256, 2), np.float32)
        e.callback(np.zeros((256, 1), np.float32), output, 256, None, False)
        self.assertTrue((output == 0).all())
        self.assertEqual(e.xruns, 1)
        self.assertIn("Invalid", e.callback_error)

    def test_true_impulse_response_and_native_24bit_wav_export(self):
        e = self.engine
        with tempfile.TemporaryDirectory() as directory:
            ir = pathlib.Path(directory) / "cab.wav"
            with wave.open(str(ir), "wb") as f:
                f.setnchannels(1)
                f.setsampwidth(2)
                f.setframerate(48000)
                f.writeframes(
                    np.array([20000, 0, 0, 0, 0, 0, 0, 0], np.int16).tobytes()
                )
            e.dispatch("ir", {"path": str(ir)})
            self.assertIsInstance(e.ir, pb.Convolution)
            preset = e.dispatch("snapshot", {})
            self.assertTrue(preset["irData"])
            e.dispatch("clearIR", {})
            ir.unlink()
            e.dispatch("restore", {"preset": preset})
            self.assertIsInstance(e.ir, pb.Convolution)
            e.prepare(
                {
                    "notes": [{"string": 0, "fret": 0, "beat": 0, "length": 1}],
                    "bars": 1,
                    "bpm": 120,
                }
            )
            rendered = e.dispatch("render", {})
            with wave.open(rendered["path"], "rb") as f:
                self.assertEqual(f.getnchannels(), 2)
                self.assertEqual(f.getsampwidth(), 3)
                self.assertEqual(f.getframerate(), 48000)
                data = f.readframes(f.getnframes())
                self.assertTrue(any(data))

    def test_stopped_preset_roundtrip_preserves_order_and_values(self):
        e = self.engine
        order = list(reversed(DEFAULT_ORDER))
        e.configure(
            {"order": order, "inputGain": -3, "outputGain": -12, "gateThreshold": -70}
        )
        saved = e.dispatch("snapshot", {})
        e.configure({"order": DEFAULT_ORDER, "inputGain": 5})
        e.dispatch("restore", {"preset": saved})
        self.assertEqual(e.order, order)
        self.assertEqual(e.input_gain, -3)
        self.assertEqual(e.output_gain, -12)
        self.assertEqual(e.gate_threshold, -70)
        with self.assertRaises(ValueError):
            e.dispatch(
                "restore",
                {"preset": {"version": 1, "plugins": [{"path": "missing.vst3"}]}},
            )
        self.assertEqual(
            e.order, order, "a failed restore must leave the current rack intact"
        )


if __name__ == "__main__":
    unittest.main()
