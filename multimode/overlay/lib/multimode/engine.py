##############################################################################################################################################
#
# Multimode engine: Runs data driven switch mappings ("profiles", JSON files) on top of PySwitch.
#
# A profile defines state variables, layers (selected by conditions on the state) and per-key operations for
# short press, long press and double click. Values can be literals or Python expressions evaluated against the
# state, labels are templates with {expression} placeholders. See /profiles/README.md for the format.
#
# Part of the qc-local-mods fork of PySwitch (GPLv3), (C) 2026 basster6. Based on PySwitch by Thomas Weber.
#
##############################################################################################################################################

from time import monotonic
from json import load as _json_load
from adafruit_midi.midi_message import MIDIMessage

from pyswitch.controller.actions import Action
from pyswitch.colors import Colors

from . import store

PROFILES_ROOT = "/profiles"

_TRIGGERS = ("short", "long", "double")

# Attributes of operations which hold values (literals or expressions)
_OP_VALUES = ("cc", "val", "pc", "note", "vel", "ch", "to", "by", "mod", "lo", "min", "max", "if")


def _ms():
    return int(monotonic() * 1000)


def load_json(path):
    with open(path, "r") as f:
        return _json_load(f)


# Raw MIDI message: sends the bytes exactly as given
class RawMessage(MIDIMessage):
    def __init__(self, data):
        self._data = bytearray(data)

    def __bytes__(self):
        return self._data


# Parses a label template like "A{mp}" into a list of (is_expression, text) parts
def parse_template(template):
    parts = []
    pos = 0
    while True:
        start = template.find("{", pos)
        if start < 0:
            break
        end = template.find("}", start)
        if end < 0:
            raise Exception("Unclosed { in template: " + template)
        if start > pos:
            parts.append((False, template[pos:start]))
        parts.append((True, template[start + 1:end]))
        pos = end + 1
    if pos < len(template):
        parts.append((False, template[pos:]))
    return parts


class Engine:

    # switches: List of PySwitch switch assignments. Keys are addressed by the assignment's "name" ("1", "A", "Up"...)
    # labels:   Dict of DisplayLabels, by key name (keys without label are allowed)
    # bar:      Status bar DisplayLabel (optional)
    # main:     Main area DisplayLabel (optional)
    # device:   Device ID (see devices.py), available as DEVICE in expressions
    # root:     Profiles directory
    # mode:     Profile name to load (optional, overrides the stored selection)
    def __init__(self, switches, labels, bar = None, main = None, device = "", root = PROFILES_ROOT, mode = None, modes = None):
        self.root = root
        self.bar = bar
        self.main = main
        self.device = device
        self.appl = None

        if modes is None:
            modes = load_json(root + "/modes.json")
        self.modes = modes["modes"]

        if mode is None:
            index = store.load_index()
            if index is None or index >= len(self.modes):
                index = self.modes.index(modes.get("default", self.modes[0]))
            mode = self.modes[index]

        self.mode = mode
        self.profile = load_json(root + "/" + mode + ".json")

        self._code = {}
        self._templates = {}
        self.pending_key = ""
        self.screen_dirty = True
        self.key_names = [a["name"] for a in switches]
        self._compile_profile()

        self.inputs = []
        self._primaries = []
        for assignment in switches:
            key = assignment["name"]
            primary = KeyAction(self, key, labels.get(key, None), True)
            self._primaries.append(primary)

            entry = {
                "assignment": assignment,
                "holdTimeMillis": self.hold_ms,
                "actions": [primary]
            }
            if self.has_trigger_anywhere(key, "long"):
                entry["actionsHold"] = [KeyAction(self, key, None, False)]

            self.inputs.append(entry)

    ## Setup ##################################################################################################################################

    def _compile_profile(self):
        p = self.profile

        self.name = p.get("name", self.mode)
        self.tag = p.get("tag", self.mode.upper())
        self.channel = int(p.get("channel", 1)) - 1
        self.hold_ms = int(p.get("holdMs", 600))
        self.double_ms = int(p.get("doubleMs", 500))

        # Namespace for expressions: constants, state, derived variables
        ns = {}
        for k, v in p.get("consts", {}).items():
            ns[k] = v
        for k, v in p.get("state", {}).items():
            ns[k] = v
        ns["MODE"] = self.tag
        ns["MODES_LIST"] = self.modes
        ns["_pend"] = ""
        ns["DEVICE"] = self.device
        self.ns = ns

        # Derived variables: List of [name, expression] (order matters, so not a dict)
        self.vars = p.get("vars", [])

        self.layers = p.get("layers", [])
        for layer in self.layers:
            if not "keys" in layer:
                layer["keys"] = {}

            # Descriptions are only used by the editor: free the memory
            layer.pop("desc", None)
            for kd in layer["keys"].values():
                kd.pop("desc", None)
        p.pop("desc", None)

        self.screen = p.get("screen", {})

        self._precompile()
        self.update_vars()

    # Compiles all expressions of the profile into functions at once. CircuitPython has no compile(), and eval()
    # parses the expression on every call (~15ms each on a RP2040), whereas calling a precompiled function is
    # more than 10 times faster. Only keys present on the device are regarded.
    def _precompile(self):
        exprs = []
        seen = {}

        def add(value):
            if isinstance(value, str) and not value in seen:
                seen[value] = True
                exprs.append(value)

        def add_template(template):
            if isinstance(template, str):
                for is_expr, text in parse_template(template):
                    if is_expr:
                        add(text)

        def add_color(value):
            if isinstance(value, list):
                for v in value:
                    add_color(v)
            elif isinstance(value, str) and not value.startswith("#") and not isinstance(getattr(Colors, value, None), tuple):
                add(value)

        def add_ops(ops):
            for op in ops:
                for attr in _OP_VALUES:
                    if attr in op:
                        add(op[attr])
                for b in op.get("raw", []):
                    add(b)
                add_ops(op.get("then", []))
                add_ops(op.get("else", []))

        def add_screen(screen):
            add_template(screen.get("bar", None))
            add_template(screen.get("main", None))
            add_color(screen.get("barColor", None))

        for _, expr in self.vars:
            add(expr)

        add_screen(self.screen)

        for layer in self.layers:
            add(layer.get("when", None))
            add_screen(layer.get("screen", {}))

            for key, kd in layer["keys"].items():
                if not key in self.key_names:
                    continue
                add_template(kd.get("label", None))
                add_color(kd.get("color", None))
                add_color(kd.get("led", None))
                add(kd.get("bright", None))
                for trigger in _TRIGGERS:
                    add_ops(kd.get(trigger, []))

        if not exprs:
            return

        src = "_F=(\n" + "".join("lambda:(" + e + "),\n" for e in exprs) + ")\n"
        try:
            exec(src, self.ns)
        except SyntaxError:
            # Find the culprit
            for e in exprs:
                try:
                    eval("lambda:(" + e + ")", {})
                except SyntaxError:
                    raise Exception("Invalid expression in profile " + self.mode + ": " + e)
            raise

        functions = self.ns.pop("_F")
        for i in range(len(exprs)):
            self._code[exprs[i]] = functions[i]

    # Evaluates an expression (strings) or returns the value as is (everything else)
    def ev(self, value):
        if not isinstance(value, str):
            return value

        fn = self._code.get(value, None)
        if fn is None:
            # Not precompiled (should not happen): slow path
            return eval(value, self.ns)

        return fn()

    # Renders a label template
    def render(self, template):
        if template is None:
            return ""

        parts = self._templates.get(template, None)
        if parts is None:
            parts = parse_template(template)
            self._templates[template] = parts

        ret = ""
        for is_expr, text in parts:
            ret += str(self.ev(text)) if is_expr else text
        return ret

    # Resolves a color definition: name, "#rrggbb", [r, g, b], list of colors, or an expression yielding one of these
    def color(self, value):
        if value is None:
            return None

        if isinstance(value, tuple):
            return value

        if isinstance(value, list):
            if len(value) == 3 and isinstance(value[0], int):
                return (value[0], value[1], value[2])
            return [self.color(v) for v in value]

        if isinstance(value, str):
            if value.startswith("#") and len(value) == 7:
                return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16))

            named = getattr(Colors, value, None)
            if isinstance(named, tuple):
                return named

            return self.color(self.ev(value))

        raise Exception("Invalid color: " + repr(value))

    def update_vars(self):
        self.ns["_pend"] = self.pending_key
        for name, expr in self.vars:
            self.ns[name] = self.ev(expr)

    ## Resolution #############################################################################################################################

    def active_layers(self):
        return [l for l in self.layers if self.ev(l.get("when", True))]

    # Returns the key definition of the first active layer which defines the given attribute for the key
    def resolve(self, key, attr, layers = None):
        for layer in (layers if layers is not None else self.active_layers()):
            kd = layer["keys"].get(key, None)
            if kd and attr in kd:
                return kd
        return None

    def has_trigger(self, key, trigger):
        return self.resolve(key, trigger) is not None

    def has_trigger_anywhere(self, key, trigger):
        for layer in self.layers:
            kd = layer["keys"].get(key, None)
            if kd and trigger in kd:
                return True
        return False

    ## Execution ##############################################################################################################################

    def trigger(self, key, trigger):
        self.update_vars()
        kd = self.resolve(key, trigger)
        if not kd:
            return

        self.run(kd[trigger])
        self.refresh()

    def run(self, ops):
        for op in ops:
            if self.run_op(op):
                self.update_vars()

    def run_op(self, op):
        ns = self.ns
        ch = self.ev(op["ch"]) - 1 if "ch" in op else self.channel

        if "cc" in op:
            self.send([0xB0 | ch, self.ev(op["cc"]), self.ev(op.get("val", 127))])

        elif "pc" in op:
            self.send([0xC0 | ch, self.ev(op["pc"])])

        elif "note" in op:
            self.send([0x90 | ch, self.ev(op["note"]), self.ev(op.get("vel", 127))])

        elif "raw" in op:
            self.send([self.ev(b) for b in op["raw"]])

        elif "set" in op:
            ns[op["set"]] = self.ev(op.get("to", 1))
            return True

        elif "toggle" in op:
            ns[op["toggle"]] = 0 if ns[op["toggle"]] else 1
            return True

        elif "inc" in op:
            name = op["inc"]
            v = ns[name] + self.ev(op.get("by", 1))
            if "mod" in op:
                lo = self.ev(op.get("lo", 0))
                v = lo + (v - lo) % self.ev(op["mod"])
            else:
                if "min" in op and v < self.ev(op["min"]):
                    v = self.ev(op["min"])
                if "max" in op and v > self.ev(op["max"]):
                    v = self.ev(op["max"])
            ns[name] = v
            return True

        elif "if" in op:
            self.run(op.get("then", []) if self.ev(op["if"]) else op.get("else", []))

        elif "mode" in op:
            self.switch_mode(op["mode"])

        else:
            raise Exception("Unknown operation: " + repr(op))

        return False

    def send(self, data):
        data = [int(b) & 0xFF for b in data]
        for i in range(1, len(data)):
            data[i] &= 0x7F

        if self.appl:
            self.appl.client.midi.send(RawMessage(data))

    # Selects another profile and restarts. target: "next", "prev" or a profile name.
    def switch_mode(self, target):
        index = self.modes.index(self.mode)
        if target == "next":
            index = (index + 1) % len(self.modes)
        elif target == "prev":
            index = (index - 1) % len(self.modes)
        else:
            index = self.modes.index(target)

        store.save_index(index)

        if self.bar:
            self.bar.text = "> " + self.modes[index]

        store.reload()

    ## Display ################################################################################################################################

    def attach(self, appl):
        if self.appl:
            return
        self.appl = appl
        appl.add_updateable(self)

        if self.profile.get("power", False):
            from .power import PowerSense
            appl.add_updateable(PowerSense(self))

    # Re-renders all keys and the screen
    def refresh(self):
        self.update_vars()
        layers = self.active_layers()

        for action in self._primaries:
            action.render(layers)

        self.render_screen(layers)
        self.screen_dirty = False

    # Called periodically by PySwitch: Renders the screen if only single keys have been rendered before
    def update(self):
        if self.screen_dirty:
            self.update_vars()
            self.render_screen(self.active_layers())
            self.screen_dirty = False

    def render_key(self, action, layers = None):
        if layers is None:
            self.update_vars()
            layers = self.active_layers()

        kd = self.resolve(action.key, "label", layers)

        if not kd:
            color = Colors.BLACK
            led = Colors.BLACK
            text = ""
            brightness = 0
        else:
            color = self.color(kd.get("color", "WHITE"))
            led = self.color(kd.get("led", None)) or color
            text = self.render(kd["label"])
            brightness = self.ev(kd.get("bright", 0.3))

        if action.switch:
            action.switch_color = led
            action.switch_brightness = brightness

        if action.label:
            action.label.text = text
            action.label.back_color = color[0] if isinstance(color, list) else color

    # Screen settings can be overridden by the first active layer that defines "screen"
    def render_screen(self, layers):
        screen = self.screen
        for layer in layers:
            if "screen" in layer:
                screen = dict(self.screen)
                screen.update(layer["screen"])
                break

        if self.bar and "bar" in screen:
            self.bar.text = self.render(screen["bar"])
            if "barColor" in screen:
                self.bar.back_color = self.color(screen["barColor"])

        if self.main and "main" in screen:
            self.main.text = self.render(screen["main"])


# One action per key and trigger group: The primary action handles short press and double click and renders
# label and LEDs, the secondary one (only present if the key has long press operations anywhere) handles long press.
class KeyAction(Action):

    def __init__(self, engine, key, label, primary):
        Action.__init__(self, {
            "display": label,
            "useSwitchLeds": primary
        })
        self.engine = engine
        self.key = key
        self.primary = primary
        self.switch = None
        self._pending_since = -1

    def init(self, appl, switch):
        Action.init(self, appl, switch)
        self.engine.attach(appl)

    def push(self):
        e = self.engine

        if not self.primary:
            e.trigger(self.key, "long")
            return

        e.update_vars()
        if not e.has_trigger(self.key, "double"):
            e.trigger(self.key, "short")
            return

        now = _ms()
        if self._pending_since >= 0 and now - self._pending_since <= e.double_ms:
            self._cancel_pending()
            e.trigger(self.key, "double")
            return

        # Wait for a possible second click
        self._pending_since = now
        e.pending_key = self.key
        e.refresh()

    def update(self):
        Action.update(self)

        if self._pending_since < 0:
            return

        if _ms() - self._pending_since <= self.engine.double_ms:
            return

        self._cancel_pending()
        self.engine.trigger(self.key, "short")

    def _cancel_pending(self):
        self._pending_since = -1
        if self.engine.pending_key == self.key:
            self.engine.pending_key = ""

    def update_displays(self):
        if self.primary:
            self.engine.render_key(self)
            self.engine.screen_dirty = True

    def render(self, layers):
        self.engine.render_key(self, layers)

    def reset(self):
        pass
