##############################################################################################################################################
#
# Persistence of the selected profile (mode) across restarts. Uses the microcontroller's non-volatile memory,
# which also works while the USB drive is exposed (the file system is read-only for the device then).
#
# The mode is stored by name, so removing or reordering modes in modes.json does not change which mode starts.
# Format: 0xA8, length, name (UTF-8, max. 32 bytes). Older versions stored the index (0xA7, index), which is still
# read once.
#
##############################################################################################################################################

_MAGIC_NAME = 0xA8
_MAGIC_INDEX = 0xA7      # old format
_MAX_NAME = 32

def _nvm():
    try:
        from microcontroller import nvm
        return nvm
    except Exception:
        return None

# Returns the stored mode name if it is one of the given modes, or None
def load_mode(modes):
    nvm = _nvm()
    if nvm is None:
        return None
    try:
        if nvm[0] == _MAGIC_NAME:
            n = nvm[1]
            if n <= _MAX_NAME:
                name = bytes(nvm[2:2 + n]).decode()
                if name in modes:
                    return name
        elif nvm[0] == _MAGIC_INDEX and nvm[1] < len(modes):
            return modes[nvm[1]]
    except Exception:
        pass
    return None

def save_mode(name):
    nvm = _nvm()
    if nvm is None:
        return
    raw = name.encode()[:_MAX_NAME]
    data = bytes((_MAGIC_NAME, len(raw))) + raw
    try:
        if bytes(nvm[0:len(data)]) != data:
            nvm[0:len(data)] = data
    except Exception:
        pass

# Restarts the firmware (code.py), which then loads the newly selected profile
def reload():
    try:
        from supervisor import reload as _reload
    except ImportError:
        return
    _reload()
