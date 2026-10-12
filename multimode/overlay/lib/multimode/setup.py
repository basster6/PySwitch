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

_DISPLAY_WIDTH = 240
_DISPLAY_HEIGHT = 240
_SLOT_HEIGHT = 40
_FOOTER_Y = 200
_BAR_Y = 180

# Returns (Splashes, labels by key name, bar label, main label)
def build_display(device = DEVICE):
    from pyswitch.ui.ui import DisplayElement, DisplayBounds
    from pyswitch.ui.elements import DisplayLabel
    from pyswitch.colors import DEFAULT_LABEL_COLOR
    from pyswitch.clients.local.callbacks.splashes import SplashesCallback

    rows = DEVICES[device]["rows"]
    labels = {}
    children = []

    for r in range(len(rows)):
        row = rows[r]
        width = _DISPLAY_WIDTH // len(row)
        y = 0 if r == 0 else _FOOTER_Y

        for i in range(len(row)):
            label = DisplayLabel(
                layout = {
                    "font": "/fonts/H20.pcf" if len(row) <= 3 else "/fonts/A12.pcf",
                    "backColor": DEFAULT_LABEL_COLOR,
                    "stroke": 1
                },
                bounds = DisplayBounds(i * width, y, width, _SLOT_HEIGHT)
            )
            labels[row[i]] = label
            children.append(label)

    bar = DisplayLabel(
        layout = {
            "font": "/fonts/A12.pcf",
            "backColor": (0, 0, 0),
            "text": ""
        },
        bounds = DisplayBounds(0, _BAR_Y, _DISPLAY_WIDTH, 20)
    )

    main = DisplayLabel(
        bounds = DisplayBounds(0, _SLOT_HEIGHT, _DISPLAY_WIDTH, _BAR_Y - _SLOT_HEIGHT),
        layout = {
            "font": "/fonts/PTSans-NarrowBold-40.pcf",
            "lineSpacing": 0.8,
            "maxTextWidth": 220,
            "text": ""
        }
    )

    children.append(bar)
    children.append(main)

    splashes = SplashesCallback(DisplayElement(
        bounds = DisplayBounds(0, 0, _DISPLAY_WIDTH, _DISPLAY_HEIGHT),
        children = children
    ))

    return splashes, labels, bar, main

def create_engine(labels, bar, main, device = DEVICE):
    from .engine import Engine
    from .devices import get_switches

    return Engine(
        switches = get_switches(device),
        labels = labels,
        bar = bar,
        main = main,
        device = device,
        modes = CONFIG
    )
