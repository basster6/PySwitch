import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))

import sim   # noqa: E402

CC = 0xB0


class TestValidation(unittest.TestCase):

    def test_all_profiles_on_all_devices(self):
        modes = sim._engine.load_json(sim.PROFILES + "/modes.json")
        for device in sim.DEVICES:
            for mode in modes["modes"]:
                self.assertEqual(sim.validate(mode, device), [], device + " / " + mode)


class TestQuadCortex(unittest.TestCase):

    def setUp(self):
        self.s = sim.Sim("qc")

    def test_initial_chain_mode(self):
        s = self.s
        self.assertEqual([s.label(k) for k in s.keys], ["A2", "B2", "PRE", "C2", "D2", "TAP"])
        self.assertEqual(s.main.text, "CH\nPRE MP2 QP2")
        self.assertEqual(s.sent, [])

    def test_chain_slots_follow_midi_page(self):
        s = self.s
        s.short("1")
        s.short("B")
        self.assertEqual(s.take(), [[CC, 39, 127], [CC, 42, 127]])

        s.long("2")                     # internal MIDI page swap, nothing sent
        self.assertEqual(s.take(), [])
        self.assertEqual(s.label("1"), "A1")

        s.short("1")
        self.assertEqual(s.take(), [[CC, 35, 127]])

    def test_tuner(self):
        s = self.s
        s.long("1")
        self.assertEqual(s.take(), [[CC, 45, 127]])
        self.assertEqual(s.bar.back_color, (255, 0, 0))
        self.assertTrue(s.bar.text.endswith(" T+"))

        s.long("1")
        self.assertEqual(s.take(), [[CC, 45, 0]])

    def test_scene_steps_wrap_and_track_qc_page(self):
        s = self.s
        s.long("A")                     # scene -1 from 0 wraps to 7 (page II)
        self.assertEqual(s.take(), [[CC, 43, 7]])
        s.long("B")
        s.long("B")
        self.assertEqual(s.take(), [[CC, 43, 0], [CC, 43, 1]])
        self.assertIn("QP1", s.main.text)

    def test_mode_cycle_waits_for_double_click(self):
        s = self.s
        s.short("3")
        self.assertEqual(s.take(), [])
        self.assertEqual(s.label("3"), "DBL?")

        s.settle()
        self.assertEqual(s.take(), [[CC, 47, 1]])
        self.assertEqual(s.label("3"), "SCN")

    def test_page_swap(self):
        s = self.s
        s.long("3")
        self.assertEqual(s.take(), [[CC, 64, 0]])
        colors, _ = s.leds("3")
        self.assertEqual(colors[2], (50, 50, 50))      # page I: left side lit

    def test_gig_view(self):
        s = self.s
        s.long("C")
        self.assertEqual(s.take(), [[CC, 46, 127]])
        self.assertEqual(s.label("1"), "AC")
        self.assertTrue(s.main.text.startswith("GV Current QP2"))

        s.short("1")                    # current QC page (II)
        s.long("1")                     # opposite page (I)
        self.assertEqual(s.take(), [[CC, 39, 127], [CC, 35, 127]])

        s.double("3")                   # swap short/long semantics
        self.assertEqual(s.take(), [])
        self.assertEqual(s.label("1"), "AO")

        s.short("1")
        self.assertEqual(s.take(), [[CC, 35, 127]])

        s.short("C")                    # tap tempo always
        self.assertEqual(s.take(), [[CC, 44, 127]])


class TestAnagram(unittest.TestCase):

    def setUp(self):
        self.s = sim.Sim("anagram")

    def test_foot_bindings_toggle(self):
        s = self.s
        self.assertEqual(s.label("1"), "FA-")
        s.short("1")
        s.short("1")
        self.assertEqual(s.take(), [[CC, 17, 127], [CC, 17, 0]])

    def test_mode_select_values_start_at_one(self):
        s = self.s
        for _ in range(3):
            s.short("C")
            s.settle()
        self.assertEqual(s.take(), [[CC, 85, 2], [CC, 85, 3], [CC, 85, 1]])

    def test_looper_layer(self):
        s = self.s
        s.long("C")
        self.assertEqual(s.take(), [[CC, 110, 127]])
        self.assertEqual(s.label("1"), "REC")

        s.short("1")
        s.short("2")
        self.assertEqual(s.take(), [[CC, 112, 127], [CC, 111, 127]])
        self.assertEqual(s.main.text, "LOOPER\nPlay/Stop")

        s.short("C")
        self.assertEqual(s.take(), [[CC, 110, 127]])
        self.assertEqual(s.label("1"), "FA-")

    def test_no_zero_values_for_system_functions(self):
        # The Anagram ignores value 0 for system functions (manual p. 88/89)
        s = self.s
        for key in ("A", "B"):
            s.short(key)
            s.long(key)
        for msg in s.take():
            self.assertNotEqual(msg[2], 0, msg)

    def test_double_click_switches_profile(self):
        s = self.s
        s.double("C")
        self.assertEqual(s.saved_index, 0)       # next after "anagram" wraps to "qc"
        self.assertTrue(s.reloaded)


class TestDevices(unittest.TestCase):

    def test_keys_missing_on_small_devices_are_ignored(self):
        s = sim.Sim("qc", device = "nano4")
        self.assertEqual(s.keys, ["1", "2", "A", "B"])
        s.short("1")
        self.assertEqual(s.take(), [[CC, 39, 127]])

    def test_mc10_extra_keys(self):
        s = sim.Sim("qc", device = "mc10")
        s.short("Up")
        self.assertEqual(s.take(), [[CC, 43, 1]])


if __name__ == "__main__":
    unittest.main()
