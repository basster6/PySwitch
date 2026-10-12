##############################################################################################################################################
#
# Boot time profile selection: Import this in code.py before pyswitch.process. If one of the keys configured in
# "bootSelect" of /profiles/modes.json is held while powering on, the assigned profile is selected (and remembered).
#
# Example: "bootSelect": { "2": "qc", "3": "anagram" }
#
# Do not use key "1": Holding it at boot exposes the USB drive (see boot.py).
#
##############################################################################################################################################

def _select():
    import board
    from digitalio import DigitalInOut, Direction, Pull
    from time import sleep, monotonic

    from .engine import load_json, PROFILES_ROOT
    from .devices import DEVICES
    from . import store

    try:
        config = load_json(PROFILES_ROOT + "/modes.json")
    except OSError:
        return

    selection = config.get("bootSelect", {})
    if not selection:
        return

    pins = DEVICES[config.get("device", "mini6")]["pins"]

    switches = []
    for key, mode in selection.items():
        if not key in pins or not mode in config["modes"]:
            continue
        sw = DigitalInOut(getattr(board, pins[key]))
        sw.direction = Direction.INPUT
        sw.pull = Pull.UP
        switches.append((sw, mode))

    sleep(0.05)

    selected = None
    for sw, mode in switches:
        if not sw.value:
            selected = mode
            break

    if selected:
        store.save_index(config["modes"].index(selected))

        # Wait for the switch to be released, so PySwitch does not see a key press (max. 3 seconds)
        start = monotonic()
        while monotonic() - start < 3 and not all(sw.value for sw, _ in switches):
            sleep(0.02)

    for sw, _ in switches:
        sw.deinit()

_select()
del _select
