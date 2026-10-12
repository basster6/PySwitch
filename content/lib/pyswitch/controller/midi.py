# MIDI Message types: These are all needed to be imported, despite not used: If not, no messages
# will go through the MIDI routings. If you encounter that messages are not forwarded, the type 
# might perhaps miss here. (not all are enabled by default to minimize RAM usage).
# If the message type (status) is not known by the adafruit_midi library at all, you can implement
# the type yourself (see MidiClockMessage below)
from adafruit_midi.midi_message import MIDIMessage
from adafruit_midi.midi_message import MIDIUnknownEvent
from adafruit_midi.control_change import ControlChange
from adafruit_midi.program_change import ProgramChange
from adafruit_midi.system_exclusive import SystemExclusive
#from adafruit_midi.mtc_quarter_frame import MtcQuarterFrame
from adafruit_midi.channel_pressure import ChannelPressure
from adafruit_midi.note_off import NoteOff
from adafruit_midi.note_on import NoteOn
from adafruit_midi.pitch_bend import PitchBend
from adafruit_midi.polyphonic_key_pressure import PolyphonicKeyPressure
#from adafruit_midi.timing_clock import TimingClock
#from adafruit_midi.start import Start
#from adafruit_midi.stop import Stop


# MIDI Clock custom message type
#class MidiClockMessage(MIDIMessage):
#    _STATUS = 0xF8
#    _STATUSMASK = 0xFF
#    LENGTH = 1
#    _slots = []

#MidiClockMessage.register_message_type()


##################################################################################################


# Describes a routing from source to target, which must be MidiDevices definitions.
class MidiRouting:

    # Used as source/target for routings to/from the application itself
    APPLICATION = 1

    def __init__(self, source, target):
        # Source MIDI device (can be either a AdafruitXXXMidiDevice or 
        # MidiController.PYSWITCH for the application itself)
        self.source = source    

        # Target MIDI device (can be either a AdafruitXXXMidiDevice or 
        # MidiController.PYSWITCH for the application itself)
        self.target = target    
        

##################################################################################################


# MIDI Communication wrapper. Can distribute/merge from/to application and external MIDI
# controllers, as defined ba routings. Remember that you have to define routes from and to
# the application manually!
class MidiController:

    # routings must be a list of MidiRouting instances
    def __init__(self, routings):
        self.__routings_from_appl = [x for x in routings if x.source == MidiRouting.APPLICATION]
        self.__routings_to_appl = [x for x in routings if x.target == MidiRouting.APPLICATION]
        self.__routings_external = [x for x in routings if x.source != MidiRouting.APPLICATION and x.target != MidiRouting.APPLICATION]

    def send(self, midi_message):
        # Send to all routings which have APPLICATION as source
        for r in self.__routings_from_appl:    
            r.target.send(midi_message)

    def receive(self):
        # Fast raw THRU path for external sources that are not routed to APPLICATION.
        # This bypasses parse/re-encode overhead for smoother keyboard performance.
        raw_handled_sources = []
        for r in self.__routings_external:
            if r.source in raw_handled_sources:
                continue

            # Keep parsed path when source is also consumed by APPLICATION.
            source_to_appl = False
            for ra in self.__routings_to_appl:
                if ra.source == r.source:
                    source_to_appl = True
                    break

            if source_to_appl:
                continue

            if hasattr(r.source, "thru_raw") and (r.source == r.target or hasattr(r.target, "send_raw")):
                r.source.thru_raw(r.target)
                raw_handled_sources.append(r.source)

        # Read each external source only once per cycle, then fan-out to all targets.
        # This avoids dropping/interleaving messages when the same source is routed both
        # to APPLICATION and to external THRU targets.
        external_routings = [x for x in self.__routings_external if x.source not in raw_handled_sources]
        routings_all = external_routings + self.__routings_to_appl

        sources = []
        results = []
        for r in routings_all:
            if r.source in sources:
                continue

            sources.append(r.source)
            results.append(r.source.receive())

        # Distribute messages to external routings
        for r in external_routings:
            for i in range(len(sources)):
                if sources[i] != r.source:
                    continue

                msg = results[i]
        
                if not msg:
                    continue
                
                if isinstance(msg, MIDIUnknownEvent):
                    continue
                
                if getattr(msg, "_STATUS", None) is None:
                    continue
                
                r.target.send(msg)

                break

        # Return first queued message for APPLICATION
        for r in self.__routings_to_appl:
            for i in range(len(sources)):
                if sources[i] != r.source:
                    continue

                msg = results[i]
                if msg:
                    return msg

                break
