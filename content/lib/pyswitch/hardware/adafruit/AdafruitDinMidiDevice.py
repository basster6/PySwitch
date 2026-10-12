from adafruit_midi import MIDI as _MIDI
from adafruit_midi.midi_message import MIDIMessage as _MIDIMessage
from adafruit_midi.midi_message import MIDIUnknownEvent as _MIDIUnknownEvent
from busio import UART as _UART

# DIN MIDI Device
class AdafruitDinMidiDevice:
    def __init__(self, 
                 gpio_in, 
                 gpio_out,
                 in_buf_size, 
                 baudrate, 
                 timeout,
                 in_channel = None,   # All
                 out_channel = 0, 
        ):

        midi_uart = _UART(
            gpio_in, 
            gpio_out, 
            baudrate = baudrate, 
            timeout = timeout
        ) 
        self.__uart = midi_uart

        self.__midi = _MIDI(
            midi_out = midi_uart, 
            out_channel = out_channel,
            midi_in = midi_uart, 
            in_channel = in_channel,
            in_buf_size = in_buf_size
        )

    # def __repr__(self):
    #     return "DIN"

    def send(self, midi_message):
        if isinstance(midi_message, _MIDIUnknownEvent):
            return

        # Keep source channel for parsed external MIDI messages.
        # For app-local raw messages without a channel field, keep default out_channel.
        channel = None
        if isinstance(midi_message, _MIDIMessage) and hasattr(midi_message, "_channel"):
            channel = midi_message._channel

        self.__midi.send(midi_message, channel=channel)

    def receive(self):
        return self.__midi.receive()

    # Raw byte helpers for low-latency DIN THRU without parse/re-encode overhead.
    def receive_raw(self, size=64):
        return self.__uart.read(size)

    def send_raw(self, data):
        if not data:
            return 0
        return self.__uart.write(data)

    def thru_raw(self, target=None, chunk_size=64, max_chunks=8):
        if target is None:
            target = self

        total = 0
        for _ in range(max_chunks):
            data = self.receive_raw(chunk_size)
            if not data:
                break

            if target is self:
                written = self.send_raw(data)
            elif hasattr(target, "send_raw"):
                written = target.send_raw(data)
            else:
                break

            if written:
                total += written

        return total
