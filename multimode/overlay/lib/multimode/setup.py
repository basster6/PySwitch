##############################################################################################################################################
#
# Glue between the PySwitch configuration files (display.py, inputs.py) and the multimode engine. Reads
# /profiles/modes.json once and builds the display layout and the engine for the configured device.
#
##############################################################################################################################################

from .engine import load_json, PROFILES_ROOT
from .devices import DEVICES

CONFIG = load_json(PROFILES_ROOT + "/modes.json")
DEVICE = CONFIG.get("device", "mini6")

# Returns (Splashes, ui) for the device, where ui holds the DisplayLabels as expected by Engine:
# { "keys": { name: { "label", "hint" } }, "status", "power", "tiles": [ { "caption", "value" } ], "message" }
def build_display(device = DEVICE):
    from pyswitch.ui.ui import DisplayElement, DisplayBounds
    from pyswitch.ui.elements import DisplayLabel
    from pyswitch.colors import DEFAULT_LABEL_COLOR
    from pyswitch.clients.local.callbacks.splashes import SplashesCallback
    from .devices import screen_layout, DISPLAY_SIZE

    layout = screen_layout(device)
    children = []

    def label(rect, stroke = 1, back = DEFAULT_LABEL_COLOR):
        x, y, w, h, font = rect
        lab = DisplayLabel(
            layout = {
                "font": font,
                "backColor": back,
                "stroke": stroke,
                "text": ""
            },
            bounds = DisplayBounds(x, y, w, h)
        )
        children.append(lab)
        return lab

    ui = {
        "keys": {},
        "status": label(layout["status"], 0, (0, 0, 0)),
        "power": label(layout["power"], 0, (0, 0, 0)),
        "tiles": [],
        "message": label(layout["message"], 1, (0, 0, 0)),
    }

    for key, rects in layout["keys"].items():
        ui["keys"][key] = {
            "label": label(rects["label"]),
            "hint": label(rects["hint"]),
        }

    for tile in layout["tiles"]:
        ui["tiles"].append({
            "caption": label(tile["caption"]),
            "value": label(tile["value"]),
        })

    splashes = SplashesCallback(DisplayElement(
        bounds = DisplayBounds(0, 0, DISPLAY_SIZE, DISPLAY_SIZE),
        children = children
    ))

    return splashes, ui

def create_engine(ui, device = DEVICE):
    from .engine import Engine
    from .devices import get_switches

    return Engine(
        switches = get_switches(device),
        ui = ui,
        device = device,
        modes = CONFIG
    )
