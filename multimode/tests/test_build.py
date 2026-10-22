import ast
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))

import mmtool   # noqa: E402

# Modules built into CircuitPython 7.3 (rp2040), or optional ones the code imports inside try/except
BUILTIN = {
    "analogio", "array", "board", "busio", "collections", "digitalio", "displayio", "fontio", "gc", "json", "math",
    "micropython", "microcontroller", "os", "rotaryio", "storage", "struct", "supervisor", "sys", "terminalio", "time",
    "usb_hid", "usb_midi", "neopixel_write", "re", "random", "traceback", "io", "fourwire",
}

ENTRIES = ("boot.py", "code.py", "display.py", "inputs.py", "communication.py", "config.py")


def resolve(base, module):
    p = module.replace(".", "/")
    for root in (os.path.join(base, "lib"), base):
        for cand in (p + ".py", p + ".mpy", p + "/__init__.py", p + "/__init__.mpy"):
            if os.path.isfile(os.path.join(root, cand)):
                return os.path.join(root, cand)
    return None


# Follows all imports (also the ones inside functions) of the device image, starting at its entry files.
# Returns the module names which are neither part of the image nor built into CircuitPython.
def missing_imports(base):
    lib = os.path.join(base, "lib")
    todo = [os.path.join(base, f) for f in ENTRIES]
    seen = set()
    missing = set()
    while todo:
        path = todo.pop()
        if path in seen or not path.endswith(".py"):     # .mpy files are complete Adafruit packages
            continue
        seen.add(path)
        package = os.path.relpath(os.path.dirname(path), lib).replace(os.sep, ".")
        with open(path) as f:
            tree = ast.parse(f.read())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                if node.level:
                    parts = package.split(".")
                    parts = parts[:len(parts) - node.level + 1]
                    module = ".".join(parts + ([node.module] if node.module else []))
                else:
                    module = node.module
                # "from x import y" imports y from module x, which may also be a submodule x.y
                names = [module] + [n for n in (module + "." + a.name for a in node.names) if resolve(base, n)]
            else:
                continue
            for name in names:
                found = resolve(base, name)
                if found:
                    todo.append(found)
                elif name.split(".")[0] not in BUILTIN:
                    missing.add(name)
    return missing


@unittest.skipIf(sys.version_info < (3, 12), "PySwitch uses f-strings which only Python 3.12+ can parse")
class TestDeviceImage(unittest.TestCase):

    def test_no_missing_modules(self):
        with tempfile.TemporaryDirectory() as out:
            mmtool.build(out)
            self.assertEqual(missing_imports(out), set())

    def test_only_layout_fonts(self):
        with tempfile.TemporaryDirectory() as out:
            mmtool.build(out)
            self.assertEqual(sorted(os.listdir(os.path.join(out, "fonts"))), ["A12.pcf", "H20.pcf", "LICENSE.txt", "PTSans-NarrowBold-40.pcf"])


if __name__ == "__main__":
    unittest.main()
