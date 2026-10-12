##############################################################################################################################################
#
# Supported devices: Switch layout (rows as seen from the player, top row first) and GPIO pins of the switches.
# The key names are the "name" attributes of the PySwitch switch assignments.
#
##############################################################################################################################################

DEVICES = {
    "nano4": {
        "title": "MIDI Captain Nano 4",
        "rows": [["1", "2"], ["A", "B"]],
        "pins": {"1": "GP1", "2": "GP25", "A": "GP9", "B": "GP10"}
    },
    "mini6": {
        "title": "MIDI Captain Mini 6",
        "rows": [["1", "2", "3"], ["A", "B", "C"]],
        "pins": {"1": "GP1", "2": "GP25", "3": "GP24", "A": "GP9", "B": "GP10", "C": "GP11"}
    },
    "mc10": {
        "title": "MIDI Captain 10",
        "rows": [["1", "2", "3", "4", "Up"], ["A", "B", "C", "D", "Down"]],
        "pins": {
            "1": "GP1", "2": "GP25", "3": "GP24", "4": "GP23", "Up": "GP20",
            "A": "GP9", "B": "GP10", "C": "GP11", "D": "GP18", "Down": "GP19"
        }
    }
}

# Returns the PySwitch switch assignments for a device, in row order. Only the needed device module is imported.
def get_switches(device):
    rows = DEVICES[device]["rows"]

    if device == "nano4":
        from pyswitch.hardware.devices import pa_midicaptain_nano_4 as m
        prefix = "PA_MIDICAPTAIN_NANO_SWITCH_"
    elif device == "mini6":
        from pyswitch.hardware.devices import pa_midicaptain_mini_6 as m
        prefix = "PA_MIDICAPTAIN_MINI_SWITCH_"
    elif device == "mc10":
        from pyswitch.hardware.devices import pa_midicaptain_10 as m
        prefix = "PA_MIDICAPTAIN_10_SWITCH_"
    else:
        raise Exception("Unknown device: " + repr(device))

    ret = []
    for row in rows:
        for key in row:
            ret.append(getattr(m, prefix + key.upper()))
    return ret
