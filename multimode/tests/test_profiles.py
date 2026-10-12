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
                warnings = []
                self.assertEqual(sim.validate(mode, device, warnings = warnings), [], device + " / " + mode)
                # All texts of the bundled profiles fit their place on the screen
                self.assertEqual(warnings, [], device + " / " + mode)

    def test_per_device_hint(self):
        self.assertEqual(sim.Sim("qc", device = "mini6").hint("3"), "PAGE SWAP")
        self.assertEqual(sim.Sim("qc", device = "mc10").hint("3"), "PAGE")


class TestQuadCortex(unittest.TestCase):

    def setUp(self):
        self.s = sim.Sim("qc")

    def test_initial_chain_mode(self):
        s = self.s
        self.assertEqual([s.label(k) for k in s.keys], ["A II", "B II", "PRE", "C II", "D II", "TAP"])
        self.assertEqual([s.hint(k) for k in s.keys], ["TUNER", "MP SWAP", "PAGE SWAP", "SCENE -", "SCENE +", "GIG VIEW"])
        self.assertEqual(s.status.text, "QC  CHAIN  MP II")
        self.assertEqual([s.tile(i) for i in range(3)], [("MODE", "PRE"), ("QC PAGE", "II"), ("SCENE", "-")])
        self.assertEqual(s.message.text, "")
        self.assertEqual(s.sent, [])

    def test_screen_rendered_without_key_press(self):
        # Regression: the engine must be registered as PySwitch Updateable to render the screen after boot
        s = sim.Sim("qc")
        self.assertIn(s.engine, s.appl.updateables)
        self.assertEqual(s.tile(0), ("MODE", "PRE"))
        self.assertEqual(s.power.text, "USB")

    def test_chain_slots_follow_midi_page(self):
        s = self.s
        s.short("1")
        s.short("B")
        self.assertEqual(s.take(), [[CC, 39, 127], [CC, 42, 127]])

        s.long("2")                     # internal MIDI page swap, nothing sent
        self.assertEqual(s.take(), [])
        self.assertEqual(s.label("1"), "A I")
        self.assertEqual(s.message.text, "MIDI PAGE I")

        s.short("1")
        self.assertEqual(s.take(), [[CC, 35, 127]])

    def test_tuner(self):
        s = self.s
        s.long("1")
        self.assertEqual(s.take(), [[CC, 45, 127]])
        # Tuner layer: everything red
        self.assertEqual(s.status.text, "QC  TUNER")
        self.assertEqual(s.status.back_color, (255, 0, 0))
        self.assertEqual([s.tiles[i]["value"].back_color for i in range(3)], [(255, 0, 0)] * 3)
        self.assertEqual(s.message.text, "TUNER ON")          # flash first
        s.advance(2000)
        self.assertEqual(s.message.text, "TUNER ON (HOLD 1)")
        self.assertEqual(s.message.back_color, (255, 0, 0))

        s.long("1")
        self.assertEqual(s.take(), [[CC, 45, 0]])
        self.assertEqual(s.status.text, "QC  CHAIN  MP II")

    def test_scene_steps_wrap_and_track_qc_page(self):
        s = self.s
        s.long("B")                     # scene unknown at start: +1 selects scene A (page I)
        self.assertEqual(s.take(), [[CC, 43, 0]])
        self.assertEqual(s.tile(2), ("SCENE I", "A"))
        s.long("A")
        s.long("A")                     # wraps to scene D of page II
        self.assertEqual(s.take(), [[CC, 43, 7], [CC, 43, 6]])
        self.assertEqual(s.tile(2), ("SCENE II", "C"))
        self.assertEqual(s.tile(1), ("QC PAGE", "II"))
        self.assertEqual(s.message.text, "SCENE C (II)")
        s.advance(2000)
        self.assertEqual(s.message.text, "")

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
        self.assertEqual(s.label("1"), "A II")
        self.assertEqual(s.hint("1"), "PAGE I")
        self.assertEqual(s.status.text, "QC  GIG VIEW")

        s.short("1")                    # current QC page (II)
        s.long("1")                     # opposite page (I)
        self.assertEqual(s.take(), [[CC, 39, 127], [CC, 35, 127]])

        s.double("3")                   # swap short/long semantics
        self.assertEqual(s.take(), [])
        self.assertEqual(s.label("1"), "A I")
        self.assertEqual(s.status.text, "QC  GIG VIEW  FLIP")

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
        self.assertEqual(s.message.text, "PLAY/STOP")
        self.assertEqual(s.tile(2), ("LOOPER", "ON"))
        self.assertEqual(s.hint("1"), "CLEAR")

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


class TestBattery(unittest.TestCase):

    def test_battery_text(self):
        from multimode.power import battery_text, charge_percent

        # USB power: nothing at the monitor pin (measured 0.016V on a Mini 6)
        self.assertEqual(battery_text("USB/DC", 0.016, None), ("USB/DC", -1, -1))

        # Not calibrated: show the pin voltage precisely enough to calibrate with it
        self.assertEqual(battery_text("BAT", 0.9123, None)[0], "BAT 0.912V")

        # Calibrated: full battery reads 0.912V at the pin
        cal = { "fullPin": 0.912, "fullVolts": 4.2 }
        self.assertEqual(battery_text("BAT", 0.912, cal), ("BAT 4.20V 100%", 4.2, 100))
        self.assertEqual(battery_text("BAT", 0.912 * 3.8 / 4.2, cal)[0], "BAT 3.80V 50%")
        self.assertEqual(charge_percent(3.0), 0)
        self.assertEqual(charge_percent(3.75), 43)


class TestDevices(unittest.TestCase):

    def test_keys_missing_on_small_devices_are_ignored(self):
        s = sim.Sim("qc", device = "nano4")
        self.assertEqual(s.keys, ["1", "2", "A", "B"])
        s.short("1")
        self.assertEqual(s.take(), [[CC, 39, 127]])

    def test_mc10_extra_keys(self):
        s = sim.Sim("qc", device = "mc10")
        s.short("Up")                   # scene unknown at start: Up selects scene A
        self.assertEqual(s.take(), [[CC, 43, 0]])


if __name__ == "__main__":
    unittest.main()
