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
from pyswitch.misc import Updateable

from . import store

PROFILES_ROOT = "/profiles"

_TRIGGERS = ("short", "long", "double")

_FLASH_MS = 1500

# Attributes of operations which hold values (literals or expressions)
_OP_VALUES = ("cc", "val", "pc", "note", "vel", "ch", "to", "by", "mod", "lo", "min", "max", "if")


# Darker variant of a color (for hint and caption backgrounds)
def _dim(color, factor = 0.45):
    if not color:
        return color
    return (int(color[0] * factor), int(color[1] * factor), int(color[2] * factor))


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


# Must be an Updateable: PySwitch's add_updateable() silently ignores everything else
class Engine(Updateable):

    # switches: List of PySwitch switch assignments. Keys are addressed by the assignment's "name" ("1", "A", "Up"...)
    # ui:       Display labels (see setup.build_display), all optional:
    #           { "keys": { name: { "label", "hint" } }, "status", "power", "tiles": [ { "caption", "value" } ], "message" }
    # device:   Device ID (see devices.py), available as DEVICE in expressions
    # root:     Profiles directory
    # mode:     Profile name to load (optional, overrides the stored selection)
    def __init__(self, switches, ui, device = "", root = PROFILES_ROOT, mode = None, modes = None):
        self.root = root
        self.ui = ui
        self.device = device
        self.flash_text = None
        self.flash_color = None
        self.flash_until = 0
        self.appl = None

        if modes is None:
            modes = load_json(root + "/modes.json")
        self.config = modes
        self.modes = modes["modes"]

        if mode is None:
            mode = store.load_mode(self.modes)
            if mode is None:
                default = modes.get("default", self.modes[0])
                mode = default if default in self.modes else self.modes[0]

        self.mode = mode
        self.profile = load_json(root + "/" + mode + ".json")

        self.pending_key = ""
        self.screen_dirty = True
        self.key_names = [a["name"] for a in switches]
        self._compile_profile()

        self.inputs = []
        self._primaries = []
        for assignment in switches:
            key = assignment["name"]
            key_ui = ui.get("keys", {}).get(key, {})
            primary = KeyAction(self, key, key_ui.get("label", None), True)
            primary.hint = key_ui.get("hint", None)
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
        if p.get("power", False):
            # Variables set by power.PowerSense, defined before its first measurement
            for k, v in (("pw", ""), ("pws", -1), ("pwv", 0), ("pwb", -1), ("pwp", -1)):
                if not k in ns:
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

            # Per device texts: { "*": "PAGE SWAP", "mc10": "PG SWP" } -> the text for this device
            for kd in layer["keys"].values():
                for attr in ("label", "hint"):
                    v = kd.get(attr, None)
                    if isinstance(v, dict):
                        kd[attr] = v.get(self.device, v.get("*", ""))

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
        templates = []
        seen = {}

        def add(value):
            if isinstance(value, str) and not value in seen:
                seen[value] = True
                exprs.append(value)

        # A template with expressions becomes one expression ("A " + str(x)), which saves the parsed parts
        def add_template(template):
            if isinstance(template, str) and not template in seen and "{" in template:
                seen[template] = True
                templates.append(template)

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
                if "flash" in op:
                    add_template(op["flash"])
                    add_color(op.get("color", None))
                add_ops(op.get("then", []))
                add_ops(op.get("else", []))

        def add_screen(screen):
            for attr in ("status", "power", "message", "bar", "main"):
                add_template(screen.get(attr, None))
            for attr in ("statusColor", "powerColor", "messageColor", "barColor"):
                add_color(screen.get(attr, None))
            for tile in screen.get("tiles", []):
                if tile:
                    add_template(tile.get("caption", None))
                    add_template(tile.get("value", None))
                    add_color(tile.get("color", None))

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
                add_template(kd.get("hint", None))
                add_color(kd.get("color", None))
                add_color(kd.get("led", None))
                add(kd.get("bright", None))
                for trigger in _TRIGGERS:
                    add_ops(kd.get(trigger, []))

        for template in templates:
            exprs.append(template)

        if not exprs:
            return

        n_plain = len(exprs) - len(templates)

        def source(i):
            if i < n_plain:
                return exprs[i]
            parts = []
            for is_expr, text in parse_template(exprs[i]):
                parts.append("str(" + text + ")" if is_expr else repr(text))
            return " + ".join(parts)

        src = "_F=(\n" + "".join("lambda:(" + source(i) + "),\n" for i in range(len(exprs))) + ")\n"
        try:
            exec(src, self.ns)
        except SyntaxError:
            # Find the culprit
            for i in range(len(exprs)):
                try:
                    eval("lambda:(" + source(i) + ")", {})
                except SyntaxError:
                    raise Exception("Invalid expression in profile " + self.mode + ": " + exprs[i])
            raise

        functions = self.ns.pop("_F")
        code = {}
        for i in range(len(exprs)):
            code[exprs[i]] = functions[i]

        # Replace the expression strings in the profile by their functions, so the strings can be freed
        # (all values are evaluated by ev(), render() and color(), which accept functions)
        def link(value):
            if isinstance(value, str):
                return code.get(value, value)
            if isinstance(value, list):
                return [link(v) for v in value]
            return value

        def link_dict(d, attrs):
            for attr in attrs:
                if attr in d:
                    d[attr] = link(d[attr])

        def link_ops(ops):
            for op in ops:
                link_dict(op, _OP_VALUES + ("raw", "flash", "color"))
                link_ops(op.get("then", []))
                link_ops(op.get("else", []))

        def link_screen(screen):
            link_dict(screen, ("status", "power", "message", "bar", "main", "statusColor", "powerColor", "messageColor", "barColor"))
            for tile in screen.get("tiles", []):
                if tile:
                    link_dict(tile, ("caption", "value", "color"))

        self.vars = [[name, link(expr)] for name, expr in self.vars]
        link_screen(self.screen)
        for layer in self.layers:
            link_dict(layer, ("when",))
            link_screen(layer.get("screen", {}))
            for kd in layer["keys"].values():
                link_dict(kd, ("label", "hint", "color", "led", "bright"))
                for trigger in _TRIGGERS:
                    link_ops(kd.get(trigger, []))

    # Evaluates a value: compiled expressions (functions) are called, strings are evaluated (slow path, only for
    # values which were not precompiled), everything else is returned as is.
    def ev(self, value):
        if callable(value):
            return value()
        if isinstance(value, str):
            return eval(value, self.ns)
        return value

    # Renders a label template (precompiled to one function, see _precompile)
    def render(self, template):
        if template is None:
            return ""

        if callable(template):
            return template()

        if not "{" in template:
            return template

        # Not precompiled (should not happen): slow path
        ret = ""
        for is_expr, text in parse_template(template):
            ret += str(self.ev(text)) if is_expr else text
        return ret

    # Resolves a color definition: name, "#rrggbb", [r, g, b], list of colors, or an expression yielding one of these
    def color(self, value):
        if value is None:
            return None

        if callable(value):
            return self.color(value())

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

        elif "flash" in op:
            # Shows a text in the message area for a while (rendered now, so it shows the state at this moment)
            self.flash_text = self.render(op["flash"])
            self.flash_color = op.get("color", None)
            self.flash_until = _ms() + int(self.ev(op.get("ms", _FLASH_MS)))

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

        store.save_mode(self.modes[index])

        if self.ui.get("message", None):
            self.ui["message"].text = "> " + self.modes[index]

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

    # Called periodically by PySwitch: Renders the screen if only single keys have been rendered before,
    # or a flash message expired
    def update(self):
        if self.flash_text is not None and _ms() >= self.flash_until:
            self.flash_text = None
            self.screen_dirty = True

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

        back = color[0] if isinstance(color, list) else color

        if action.label:
            action.label.text = text
            action.label.back_color = back

        if action.hint:
            action.hint.text = self.render(kd.get("hint", "")) if kd else ""
            action.hint.back_color = _dim(back)

    # Screen settings of the profile, overridden by the first active layer that defines "screen" (attribute by
    # attribute, tiles index by index). "bar", "barColor" and "main" are the names of profile schema 1.
    def screen_for(self, layers):
        screen = dict(self.screen)
        for layer in layers:
            if "screen" in layer:
                override = layer["screen"]
                for attr, value in override.items():
                    if attr == "tiles" and "tiles" in screen:
                        merged = []
                        for i in range(max(len(screen["tiles"]), len(value))):
                            tile = dict(screen["tiles"][i]) if i < len(screen["tiles"]) else {}
                            if i < len(value) and value[i]:
                                tile.update(value[i])
                            merged.append(tile)
                        screen["tiles"] = merged
                    else:
                        screen[attr] = value
                break

        for old, new in (("bar", "status"), ("barColor", "statusColor"), ("main", "message")):
            if old in screen and not new in screen:
                screen[new] = screen[old]
        return screen

    def render_screen(self, layers):
        screen = self.screen_for(layers)
        ui = self.ui

        status_color = self.color(screen.get("statusColor", "BLACK"))

        if ui.get("status", None):
            ui["status"].text = self.render(screen.get("status", ""))
            ui["status"].back_color = status_color

        if ui.get("power", None):
            ui["power"].text = self.render(screen.get("power", ""))
            ui["power"].back_color = self.color(screen.get("powerColor", None)) or status_color

        tiles = screen.get("tiles", [])
        labels = ui.get("tiles", [])
        for i in range(len(labels)):
            tile = tiles[i] if i < len(tiles) else {}
            color = self.color(tile.get("color", "DARK_GRAY"))
            labels[i]["caption"].text = self.render(tile.get("caption", ""))
            labels[i]["caption"].back_color = _dim(color)
            labels[i]["value"].text = self.render(tile.get("value", ""))
            labels[i]["value"].back_color = color

        if ui.get("message", None):
            if self.flash_text is not None:
                ui["message"].text = self.flash_text
                ui["message"].back_color = self.color(self.flash_color) or self.color(screen.get("messageColor", "BLACK"))
            else:
                ui["message"].text = self.render(screen.get("message", ""))
                ui["message"].back_color = self.color(screen.get("messageColor", "BLACK"))


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
        self.hint = None
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
