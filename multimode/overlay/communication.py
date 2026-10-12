from pyswitch.controller.midi import MidiRouting
from pyswitch.hardware.devices.pa_midicaptain import PA_MIDICAPTAIN_USB_MIDI
from pyswitch.hardware.devices.pa_midicaptain import PA_MIDICAPTAIN_DIN_MIDI

# Channel is zero-based: 0 => MIDI channel 1
_OUT_CH = 0

_DIN_MIDI = PA_MIDICAPTAIN_DIN_MIDI(
    in_channel=None,
    out_channel=_OUT_CH,
    in_buf_size=512,
)

_USB_MIDI = PA_MIDICAPTAIN_USB_MIDI(
    in_channel=None,
    out_channel=_OUT_CH,
    in_buf_size=512,
)

Communication = {
    "midi": {
        "routings": [
            # DIN -> DIN Thru (pass incoming DIN messages straight to DIN out)
            MidiRouting(
                source=_DIN_MIDI,
                target=_DIN_MIDI,
            ),

            # App <- USB
            MidiRouting(
                source=_USB_MIDI,
                target=MidiRouting.APPLICATION,
            ),

            # App -> USB
            MidiRouting(
                source=MidiRouting.APPLICATION,
                target=_USB_MIDI,
            ),

            # NOTE:
            # Keep DIN input out of APPLICATION path for low-latency THRU.
            # If you really need app-side DIN parsing, re-enable the route below.
            # MidiRouting(
            #     source=_DIN_MIDI,
            #     target=MidiRouting.APPLICATION,
            # ),

            # App -> DIN
            MidiRouting(
                source=MidiRouting.APPLICATION,
                target=_DIN_MIDI,
            ),
        ]
    }
}
