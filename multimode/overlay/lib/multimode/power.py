##############################################################################################################################################
#
# Power source / battery monitor for MIDI Captain devices. Enable with "power": true in a profile.
#
# Sets the state variables:
#   pw   Display text: "USB/DC", "BAT 0.912V" (not calibrated: voltage at the monitor pin) or "BAT 4.12V 92%"
#   pws  Power source: 0 = USB/DC, 1 = battery, 2 = DC
#   pwv  Voltage at the monitor pin (V), pwb battery voltage (V, -1 if not calibrated), pwp charge (%, -1 if unknown)
#
# Calibration ("battery" in /profiles/modes.json): The divider in front of VOLTAGE_MONITOR is unknown for the
# MIDI Captain (it reads ~0V on USB power, 0.9V with a full battery on a Mini 6), but it is a fixed ratio. So the pin
# voltage measured with a fully charged battery ("fullPin") is mapped to the full cell voltage ("fullVolts", 4.2V for
# Li-ion) and the charge is estimated from a Li-ion discharge curve.
#
#   "battery": { "fullPin": 0.912, "fullVolts": 4.2 }
#
##############################################################################################################################################

from time import monotonic
from pyswitch.misc import Updateable

_POLL_INTERVAL_MS = 5000
_MIN_VOLTAGE = 0.2       # Below this, nothing is connected to the monitor pin (USB power)
_SAMPLES = 16

# Li-ion cell voltage -> charge (%), approximately
_CURVE = ((3.30, 0), (3.40, 5), (3.50, 10), (3.60, 20), (3.70, 35), (3.80, 50), (3.90, 65), (4.00, 80), (4.10, 90), (4.20, 100))


def charge_percent(volts):
    if volts <= _CURVE[0][0]:
        return 0
    for i in range(1, len(_CURVE)):
        v1, p1 = _CURVE[i]
        if volts <= v1:
            v0, p0 = _CURVE[i - 1]
            return int(p0 + (p1 - p0) * (volts - v0) / (v1 - v0) + 0.5)
    return 100


# Returns (text, battery volts or -1, percent or -1) for a source name, the monitor pin voltage and the calibration
def battery_text(source, pin_volts, calibration):
    if pin_volts < _MIN_VOLTAGE:
        return source, -1, -1

    full_pin = calibration.get("fullPin", 0) if calibration else 0
    if not full_pin:
        return source + " " + ("%.3f" % pin_volts) + "V", -1, -1

    volts = pin_volts * calibration.get("fullVolts", 4.2) / full_pin
    percent = charge_percent(volts)
    return source + " " + ("%.2f" % volts) + "V " + str(percent) + "%", volts, percent


class PowerSense(Updateable):
    def __init__(self, engine):
        self._engine = engine
        self._next_poll_ms = 0
        self._last = None
        self._calibration = engine.config.get("battery", None)

        self._gp4 = self._gp6 = self._vm = None
        try:
            import board
            import digitalio
        except ImportError:   # Not running on a device (simulation)
            return

        self._gp4 = self._input(board, digitalio, "GP4")
        self._gp6 = self._input(board, digitalio, "GP6")

        try:
            if hasattr(board, "VOLTAGE_MONITOR"):
                import analogio
                self._vm = analogio.AnalogIn(board.VOLTAGE_MONITOR)
        except Exception:
            self._vm = None

    def _input(self, board, digitalio, name):
        try:
            if hasattr(board, name):
                pin = digitalio.DigitalInOut(getattr(board, name))
                pin.switch_to_input(pull = None)
                return pin
        except Exception:
            pass
        return None

    def update(self):
        now_ms = int(monotonic() * 1000)
        if now_ms < self._next_poll_ms:
            return
        self._next_poll_ms = now_ms + _POLL_INTERVAL_MS

        if self._gp4 and self._gp4.value:
            source, code = "BAT", 1
        elif self._gp6 and self._gp6.value:
            source, code = "DC", 2
        else:
            source, code = "USB/DC", 0

        pin_volts = 0
        if self._vm:
            total = 0
            for _ in range(_SAMPLES):
                total += self._vm.value
            pin_volts = total * 3.3 / 65535.0 / _SAMPLES

        text, volts, percent = battery_text(source, pin_volts, self._calibration)

        if text == self._last:
            return
        self._last = text

        ns = self._engine.ns
        ns["pw"] = text
        ns["pws"] = code
        ns["pwv"] = pin_volts
        ns["pwb"] = volts
        ns["pwp"] = percent
        self._engine.refresh()
