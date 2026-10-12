##############################################################################################################################################
#
# Desktop simulation of the multimode engine (CPython): Mocks the CircuitPython specific modules, runs the real
# PySwitch SwitchController and the engine, and records sent MIDI messages, labels and LEDs.
#
##############################################################################################################################################

import os
import sys
import types

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OVERLAY = os.path.join(REPO, "multimode", "overlay")
PROFILES = os.path.join(OVERLAY, "profiles")


def install():
    if "multimode.engine" in sys.modules:
        return

    for path in (os.path.join(REPO, "content", "lib"), os.path.join(OVERLAY, "lib")):
        if path not in sys.path:
            sys.path.append(path)   # append: content/lib contains a functools.py which must not shadow the stdlib

    if "micropython" not in sys.modules:
        mp = types.ModuleType("micropython")
        mp.const = lambda x: x
        sys.modules["micropython"] = mp

    if "adafruit_midi.midi_message" not in sys.modules:
        pkg = types.ModuleType("adafruit_midi")
        pkg.__path__ = []
        mm = types.ModuleType("adafruit_midi.midi_message")

        class MIDIMessage:
            pass

        mm.MIDIMessage = MIDIMessage
        pkg.midi_message = mm
        sys.modules["adafruit_midi"] = pkg
        sys.modules["adafruit_midi.midi_message"] = mm


install()

from multimode import engine as _engine      # noqa: E402
from multimode import store as _store        # noqa: E402
from multimode.devices import DEVICES, TILES # noqa: E402
from pyswitch.controller.inputs import SwitchController   # noqa: E402
from pyswitch.misc import Updater                         # noqa: E402


class FakeLabel:
    def __init__(self):
        self.text = ""
        self.back_color = None


class FakeSwitchModel:
    def __init__(self):
        self.pushed = False

    def init(self):
        pass


class FakePeriod:
    def __init__(self):
        self.exceeded_value = False

    def reset(self):
        self.exceeded_value = False

    @property
    def exceeded(self):
        return self.exceeded_value


class FakeMidi:
    def __init__(self):
        self.sent = []

    def send(self, msg):
        self.sent.append(list(msg.__bytes__()))


class FakeClient:
    def __init__(self):
        self.midi = FakeMidi()


class FakeLedDriver:
    def __init__(self):
        self.leds = [(0, 0, 0)] * 30

    def fill(self, color):
        self.leds = [color] * 30


# Uses PySwitch's real Updater, which ignores objects that are not Updateables
class FakeAppl(Updater):
    def __init__(self):
        Updater.__init__(self)
        self.client = FakeClient()
        self.led_driver = FakeLedDriver()
        self.shared = {}


class Sim:
    # Simulates a device running a profile. Time is simulated (milliseconds), see advance().
    def __init__(self, mode, device = "mini6", root = PROFILES, modes = None):
        self.now = 0
        _engine._ms = lambda: self.now

        self.saved_index = None
        self.reloaded = False
        _store.save_index = self._save_index
        _store.load_index = lambda: None
        _store.reload = self._reload

        if modes is None:
            modes = _engine.load_json(root + "/modes.json")

        self.keys = [k for row in DEVICES[device]["rows"] for k in row]
        self.models = {k: FakeSwitchModel() for k in self.keys}
        # Same structure as setup.build_display()
        self.labels = {k: FakeLabel() for k in self.keys}
        self.hints = {k: FakeLabel() for k in self.keys}
        self.status = FakeLabel()
        self.power = FakeLabel()
        self.message = FakeLabel()
        self.tiles = [{"caption": FakeLabel(), "value": FakeLabel()} for _ in range(TILES)]
        ui = {
            "keys": {k: {"label": self.labels[k], "hint": self.hints[k]} for k in self.keys},
            "status": self.status,
            "power": self.power,
            "tiles": self.tiles,
            "message": self.message,
        }

        pixel = 0
        switches = []
        for k in self.keys:
            switches.append({"model": self.models[k], "pixels": (pixel, pixel + 1, pixel + 2), "name": k})
            pixel += 3

        self.engine = _engine.Engine(
            switches = switches, ui = ui,
            device = device, root = root, mode = mode, modes = modes
        )

        self.appl = FakeAppl()
        self.periods = {}
        self.controllers = {}
        for entry in self.engine.inputs:
            key = entry["assignment"]["name"]
            self.periods[key] = FakePeriod()
            self.controllers[key] = SwitchController(self.appl, entry, self.periods[key])

        self.tick()

    def _save_index(self, index):
        self.saved_index = index

    def _reload(self):
        self.reloaded = True

    @property
    def sent(self):
        return self.appl.client.midi.sent

    def take(self):
        ret = list(self.sent)
        del self.sent[:]
        return ret

    def tick(self):
        for c in self.controllers.values():
            c.process()
        for u in self.appl.updateables:
            u.update()

    def advance(self, ms):
        self.now += ms
        self.tick()

    def short(self, key):
        self.models[key].pushed = True
        self.tick()
        self.advance(50)
        self.models[key].pushed = False
        self.tick()

    def long(self, key):
        self.models[key].pushed = True
        self.tick()
        self.periods[key].exceeded_value = True
        self.advance(self.engine.hold_ms)
        self.models[key].pushed = False
        self.periods[key].exceeded_value = False
        self.tick()

    def double(self, key):
        self.short(key)
        self.advance(50)
        self.short(key)

    # Waits until a pending double click window has passed
    def settle(self):
        self.advance(self.engine.double_ms + 1)

    def label(self, key):
        return self.labels[key].text

    def hint(self, key):
        return self.hints[key].text

    def tile(self, i):
        return self.tiles[i]["caption"].text, self.tiles[i]["value"].text

    def leds(self, key):
        c = self.controllers[key]
        return list(c.colors), list(c.brightnesses)


_metrics = None

# Width in pixels of a text in one of the firmware fonts (font_metrics.json, generated by render.py --metrics)
def text_width(font, text):
    global _metrics
    if _metrics is None:
        import json
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "font_metrics.json")) as f:
            _metrics = json.load(f)
    widths = _metrics[font]
    return max(sum(widths.get(c, widths["M"]) for c in line) for line in str(text).split("\n"))


# Checks a profile: Evaluates all labels, colors and screen templates in every layer, and runs every operation once
# (each in a fresh simulation). Returns a list of error strings (empty if OK). Texts which do not fit their place on
# the screen (in the initial state) are added to warnings, if a list is passed.
def validate(mode, device = "mini6", root = PROFILES, warnings = None):
    errors = []
    from multimode.devices import screen_layout
    layout = screen_layout(device)

    def fits(where, text, rect):
        if warnings is not None and text and text_width(rect[4], text) > rect[2] - 2:
            warnings.append("%s: \"%s\" is %dpx wide, the space has %dpx" % (where, text, text_width(rect[4], text), rect[2] - 2))

    try:
        base = Sim(mode, device = device, root = root)
    except Exception as e:
        return [mode + ": cannot load: " + repr(e)]

    engine = base.engine
    known = set(DEVICES[device]["rows"][0] + DEVICES[device]["rows"][1])

    for layer in engine.layers:
        lname = layer.get("name", "?")

        for key, kd in layer["keys"].items():
            where = mode + " / " + lname + " / key " + key

            if key not in known:
                continue

            for attr in kd:
                if attr not in ("label", "hint", "color", "led", "bright", "desc") + _engine._TRIGGERS:
                    errors.append(where + ": unknown attribute " + repr(attr))

            try:
                if "label" in kd:
                    fits(where + " / label", engine.render(kd["label"]), layout["keys"][key]["label"])
                if "hint" in kd:
                    fits(where + " / hint", engine.render(kd["hint"]), layout["keys"][key]["hint"])
                engine.color(kd.get("color", "WHITE"))
                if "led" in kd:
                    engine.color(kd["led"])
            except Exception as e:
                errors.append(where + ": display: " + repr(e))

            for trigger in _engine._TRIGGERS:
                if trigger not in kd:
                    continue
                try:
                    sim = Sim(mode, device = device, root = root)
                    sim.engine.run(kd[trigger])
                    sim.engine.refresh()
                    if sim.engine.flash_text:
                        fits(where + " / " + trigger + " message", sim.engine.flash_text, layout["message"])
                    for msg in sim.sent:
                        if any(b < 0 or b > 255 for b in msg):
                            errors.append(where + " / " + trigger + ": invalid MIDI bytes " + repr(msg))
                except Exception as e:
                    errors.append(where + " / " + trigger + ": " + repr(e))

        if "screen" in layer:
            try:
                engine.render_screen([layer])
                b = base
                fits(mode + " / " + lname + " / status", b.status.text, layout["status"])
                fits(mode + " / " + lname + " / power", b.power.text, layout["power"])
                fits(mode + " / " + lname + " / message", b.message.text, layout["message"])
                for i in range(len(b.tiles)):
                    fits(mode + " / " + lname + " / tile %d caption" % (i + 1), b.tiles[i]["caption"].text, layout["tiles"][i]["caption"])
                    fits(mode + " / " + lname + " / tile %d value" % (i + 1), b.tiles[i]["value"].text, layout["tiles"][i]["value"])
            except Exception as e:
                errors.append(mode + " / " + lname + " / screen: " + repr(e))

    return errors
