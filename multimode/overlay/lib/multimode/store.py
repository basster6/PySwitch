##############################################################################################################################################
#
# Persistence of the selected profile (mode) index across restarts. Uses the microcontroller's non-volatile memory,
# which also works while the USB drive is exposed (the file system is read-only for the device then).
#
##############################################################################################################################################

_MAGIC = 0xA7

# Returns the stored mode index or None
def load_index():
    try:
        from microcontroller import nvm
        if nvm[0] == _MAGIC:
            return nvm[1]
    except Exception:
        pass
    return None

def save_index(index):
    try:
        from microcontroller import nvm
        if nvm[0] != _MAGIC or nvm[1] != index:
            nvm[0:2] = bytes((_MAGIC, index))
    except Exception:
        pass

# Restarts the firmware (code.py), which then loads the newly selected profile
def reload():
    try:
        from supervisor import reload as _reload
    except ImportError:
        return
    _reload()
