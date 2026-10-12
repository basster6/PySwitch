##############################################################################################################################################
#
# Power source / voltage monitor for MIDI Captain devices. Enable with "power": true in a profile.
# Sets the state variables "pw" (display text like "BAT > 1.0V > 3.0V") and "pws" (0 = USB/DC, 1 = battery, 2 = DC).
#
##############################################################################################################################################

from time import monotonic
from pyswitch.misc import Updateable

_POLL_INTERVAL_MS = 5000


class PowerSense(Updateable):
    def __init__(self, engine):
        self._engine = engine
        self._next_poll_ms = 0
        self._last = None

        self._gp4 = self._gp6 = self._vm = None
        try:
            import board
            import digitalio
        except ImportError:   # Not running on a device (simulation)
            return

        self._gp4 = self._input(board, digitalio, "GP4")
        self._gp6 = self._input(board, digitalio, "GP6")

        self._vm = None
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

        if self._vm:
            v = (self._vm.value * 3.3) / 65535.0
            text = source + " > " + ("%.1f" % v) + "V > " + ("%.1f" % (v * 3)) + "V"
        else:
            text = source

        if text == self._last:
            return
        self._last = text

        ns = self._engine.ns
        ns["pw"] = text
        ns["pws"] = code
        self._engine.refresh()
