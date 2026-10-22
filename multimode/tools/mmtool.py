#!/usr/bin/env python3
##############################################################################################################################################
#
# Multimode tool: validate profiles, build the device file tree and deploy it to a connected MIDI Captain.
#
#   python3 multimode/tools/mmtool.py validate            Check all profiles on all devices
#   python3 multimode/tools/mmtool.py build [--out DIR]   Assemble content/ (upstream PySwitch) + multimode/overlay
#   python3 multimode/tools/mmtool.py deploy [--dry-run]  Validate, build, back up the device, copy changed files
#                                     [--profiles]        (profiles on the device are kept unless --profiles is given)
#   python3 multimode/tools/mmtool.py backup              Back up the device drive
#   python3 multimode/tools/mmtool.py restore DIR         Copy a backup back onto the device
#   python3 multimode/tools/mmtool.py site [--out DIR]    Build the web editor including firmware files
#   python3 multimode/tools/mmtool.py serve               Build and serve the web editor on http://localhost:8765
#
# The device drive must be exposed (hold switch 1 while powering on).
#
##############################################################################################################################################

import argparse
import filecmp
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile

TOOLS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(TOOLS, "..", ".."))
CONTENT = os.path.join(REPO, "content")
OVERLAY = os.path.join(REPO, "multimode", "overlay")
BUILD = os.path.join(REPO, "multimode", "build")
BACKUPS = os.path.join(REPO, "multimode", "backups")
SITE = os.path.join(REPO, "multimode", "site")
WEB = os.path.join(REPO, "multimode", "web")

VOLUME_NAMES = ("CIRCUITPY", "MIDICAPTAIN")

# Files from content/ which are part of the device image (the rest is replaced by the overlay)
CONTENT_ITEMS = ("boot.py", "config.py", "communication.py", "fonts", "lib")

# Files of content/ which multimode never imports (checked by tests/test_build.py). Every file costs seconds when
# writing to the drive, so these are left out of the device image.
PRUNE = (
    "lib/adafruit_hid/",
    "lib/functools.py",
    "lib/pyswitch/clients/boomerang/",
    "lib/pyswitch/clients/kemper/",
    "lib/pyswitch/clients/local/actions/",
    "lib/pyswitch/clients/local/mappings/",
    "lib/pyswitch/controller/actions/AnalogAction.py",
    "lib/pyswitch/controller/actions/EncoderAction.py",
    "lib/pyswitch/controller/callbacks/effect_enable.py",
    "lib/pyswitch/controller/callbacks/parameter_display.py",
    "lib/pyswitch/controller/preview.py",
    "lib/pyswitch/controller/strobe.py",
)

# CircuitPython for the RP2040 of the MIDI Captain (same version as the stock firmware 1.x), bundled with the web
# editor so it can install it on devices with another firmware (stock firmware 5.x is no CircuitPython)
CIRCUITPYTHON = {
    "name": "adafruit-circuitpython-raspberry_pi_pico-en_US-7.3.1.uf2",
    "url": "https://downloads.circuitpython.org/bin/raspberry_pi_pico/en_US/adafruit-circuitpython-raspberry_pi_pico-en_US-7.3.1.uf2",
    "sha256": "1f32b7cd998b3375702a1aca19e2c4487ed589f3460d364716748fe88058c84a",
}
CACHE = os.path.join(REPO, "multimode", ".cache")

IGNORE = shutil.ignore_patterns("toc.php", "._*", "__pycache__", "*.pyc", ".DS_Store")
DEVICE_JUNK = ("._", ".fseventsd", ".Trashes", "System Volume Information", ".metadata_never_index", ".DS_Store")


def find_volume(explicit = None):
    if explicit:
        return explicit if os.path.isfile(os.path.join(explicit, "boot_out.txt")) else None

    for name in VOLUME_NAMES:
        path = os.path.join("/Volumes", name)
        if os.path.isfile(os.path.join(path, "boot_out.txt")):
            return path

    # Any volume with a CircuitPython boot_out.txt
    if os.path.isdir("/Volumes"):
        for name in os.listdir("/Volumes"):
            path = os.path.join("/Volumes", name)
            try:
                with open(os.path.join(path, "boot_out.txt")) as f:
                    if "CircuitPython" in f.read(200):
                        return path
            except OSError:
                pass
    return None


def cmd_validate(args):
    sys.path.insert(0, TOOLS)
    import sim

    modes = sim._engine.load_json(os.path.join(OVERLAY, "profiles", "modes.json"))
    devices = [args.device] if args.device else list(sim.DEVICES)

    errors = []
    for device in devices:
        for mode in modes["modes"]:
            warnings = []
            errs = sim.validate(mode, device, warnings = warnings)
            print(("OK   " if not errs else "FAIL ") + device + " / " + mode)
            for w in sorted(set(warnings)):
                print("  WARN " + w)
            errors += errs

    for e in errors:
        print("  " + e)

    if modes.get("default", modes["modes"][0]) not in modes["modes"]:
        errors.append("modes.json: default not in modes")
        print("  " + errors[-1])

    return 0 if not errors else 1


def build(out, device = None):
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    for item in CONTENT_ITEMS:
        src = os.path.join(CONTENT, item)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(out, item), ignore = IGNORE)
        else:
            shutil.copy2(src, out)

    # Overlay: own files win over content/
    for root, dirs, files in os.walk(OVERLAY):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        rel = os.path.relpath(root, OVERLAY)
        os.makedirs(os.path.join(out, rel), exist_ok = True)
        for f in files:
            if f.endswith(".pyc") or f.startswith("._") or f == ".DS_Store":
                continue
            shutil.copy2(os.path.join(root, f), os.path.join(out, rel, f))

    for rel in PRUNE:
        path = os.path.join(out, rel)
        if os.path.isdir(path):
            shutil.rmtree(path)
        elif os.path.isfile(path):
            os.remove(path)

    # Only the fonts of the screen layout (multimode.devices)
    with open(os.path.join(OVERLAY, "lib", "multimode", "devices.py")) as f:
        fonts = set(os.path.basename(p) for p in re.findall(r'"/fonts/([^"]+)"', f.read()))
    for name in os.listdir(os.path.join(out, "fonts")):
        if name.endswith(".pcf") and name not in fonts:
            os.remove(os.path.join(out, "fonts", name))

    split_descriptions(os.path.join(out, "profiles"))

    with open(os.path.join(out, "lib", "multimode", "VERSION"), "w") as f:
        f.write(version() + "\n")

    if device:
        path = os.path.join(out, "profiles", "modes.json")
        with open(path) as f:
            modes = json.load(f)
        modes["device"] = device
        with open(path, "w") as f:
            json.dump(modes, f, indent = 2)

    return out


# Version of the build: <PySwitch version>+mm<commit count>.<hash>[.local]. The commit count increases with every
# commit, so versions can be compared. ".local" marks builds containing uncommitted changes.
def version():
    with open(os.path.join(CONTENT, "lib", "pyswitch", "misc.py")) as f:
        m = re.search(r'PYSWITCH_VERSION\s*=\s*"([^"]+)"', f.read())
    base = m.group(1) if m else "0"

    def git(*cmd):
        return subprocess.check_output(["git", "-C", REPO] + list(cmd), stderr = subprocess.DEVNULL).decode().strip()

    try:
        count = git("rev-list", "--count", "HEAD")
        rev = git("rev-parse", "--short=7", "HEAD")
        dirty = git("status", "--porcelain", "--untracked-files=no", "--", "content", "multimode/overlay") != ""
    except (OSError, subprocess.CalledProcessError):
        return base + "+mm0.unknown"
    return "%s+mm%s.%s%s" % (base, count, rev, ".local" if dirty else "")


# Builds the web app: the editor (multimode/web), the default profiles, and the firmware files with a manifest
# (everything of the build except the profiles, which are user data).
def build_site(out):
    fw_build = build(BUILD)

    if os.path.isdir(out):
        shutil.rmtree(out)
    shutil.copytree(WEB, out, ignore = IGNORE)
    shutil.copytree(os.path.join(fw_build, "profiles"), os.path.join(out, "profiles"))

    files = []
    for rel in list_files(fw_build):
        if rel.startswith("profiles" + os.sep):
            continue
        src = os.path.join(fw_build, rel)
        dst = os.path.join(out, "firmware", rel)
        os.makedirs(os.path.dirname(dst), exist_ok = True)
        shutil.copyfile(src, dst)
        with open(src, "rb") as f:
            data = f.read()
        files.append({"path": rel.replace(os.sep, "/"), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})

    with open(os.path.join(fw_build, "lib", "multimode", "VERSION")) as f:
        ver = f.read().strip()

    # Manual install (browsers without File System Access): the device image per device model as ZIP
    with open(os.path.join(fw_build, "profiles", "modes.json")) as f:
        modes = json.load(f)
    sys.path.insert(0, os.path.join(OVERLAY, "lib"))
    from multimode.devices import DEVICES, screen_layout
    zips = {}
    for device in DEVICES:
        name = "multimode-%s-%s.zip" % (device, ver)
        with zipfile.ZipFile(os.path.join(out, "firmware", name), "w", zipfile.ZIP_DEFLATED) as z:
            for rel in list_files(fw_build):
                if rel == os.path.join("profiles", "modes.json"):
                    z.writestr("profiles/modes.json", json.dumps(dict(modes, device = device), indent = 2) + "\n")
                else:
                    z.write(os.path.join(fw_build, rel), rel.replace(os.sep, "/"))
        zips[device] = name

    os.makedirs(os.path.join(out, "circuitpython"))
    shutil.copyfile(circuitpython_uf2(), os.path.join(out, "circuitpython", CIRCUITPYTHON["name"]))

    with open(os.path.join(out, "firmware", "manifest.json"), "w") as f:
        json.dump({"version": ver, "files": files, "zips": zips, "circuitpython": "circuitpython/" + CIRCUITPYTHON["name"]}, f, indent = 1)

    # Font widths for the editor's overflow check
    shutil.copyfile(os.path.join(TOOLS, "font_metrics.json"), os.path.join(out, "fonts.json"))

    # Screen layouts of all devices for the editor's preview (same definition as on the device)
    with open(os.path.join(out, "layout.json"), "w") as f:
        json.dump({d: screen_layout(d) for d in DEVICES}, f)

    with open(os.path.join(out, "profiles", "index.json"), "w") as f:
        json.dump(sorted(n[:-5] for n in os.listdir(os.path.join(out, "profiles")) if n.endswith(".json") and not n.endswith(".desc.json") and n not in ("modes.json", "index.json")), f)

    return out


# Path of the CircuitPython UF2 (downloaded once into multimode/.cache, checked against the pinned hash)
def circuitpython_uf2():
    path = os.path.join(CACHE, CIRCUITPYTHON["name"])
    if not os.path.isfile(path):
        import urllib.request
        os.makedirs(CACHE, exist_ok = True)
        with urllib.request.urlopen(CIRCUITPYTHON["url"]) as r:
            data = r.read()
        if hashlib.sha256(data).hexdigest() != CIRCUITPYTHON["sha256"]:
            raise RuntimeError("Unexpected hash of " + CIRCUITPYTHON["url"])
        with open(path, "wb") as f:
            f.write(data)
    return path


def cmd_site(args):
    out = build_site(args.out or SITE)
    print("Built " + out)
    return 0


def cmd_serve(args):
    import http.server
    import functools

    out = build_site(SITE)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory = out)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print("Editor: http://localhost:%d  (Chrome or Edge, Ctrl-C to stop)" % args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


# Moves the descriptions (only used by the editor) from each profile into <name>.desc.json, so the firmware
# does not parse them. Same format as splitDesc() in web/app.js.
def split_descriptions(profiles_dir):
    for name in os.listdir(profiles_dir):
        if not name.endswith(".json") or name == "modes.json" or name.endswith(".desc.json"):
            continue
        path = os.path.join(profiles_dir, name)
        with open(path) as f:
            profile = json.load(f)

        desc = {"layers": []}
        if "desc" in profile:
            desc["profile"] = profile.pop("desc")
        for layer in profile.get("layers", []):
            d = {}
            if "desc" in layer:
                d["desc"] = layer.pop("desc")
            for key, kd in layer.get("keys", {}).items():
                if "desc" in kd:
                    d.setdefault("keys", {})[key] = kd.pop("desc")
            desc["layers"].append(d)

        with open(path, "w") as f:
            json.dump(profile, f, indent = 2, ensure_ascii = False)
            f.write("\n")
        with open(path[:-5] + ".desc.json", "w") as f:
            json.dump(desc, f, indent = 1, ensure_ascii = False)
            f.write("\n")


def cmd_build(args):
    out = build(args.out or BUILD, args.device)
    print("Built " + out)
    return 0


def list_files(base):
    ret = []
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(DEVICE_JUNK)]
        for f in files:
            if f.startswith(DEVICE_JUNK):
                continue
            ret.append(os.path.relpath(os.path.join(root, f), base))
    return sorted(ret)


def backup(volume):
    target = os.path.join(BACKUPS, time.strftime("%Y%m%d-%H%M%S"))
    for rel in list_files(volume):
        dst = os.path.join(target, rel)
        os.makedirs(os.path.dirname(dst), exist_ok = True)
        shutil.copy2(os.path.join(volume, rel), dst)
    return target


def cmd_backup(args):
    volume = find_volume(args.volume)
    if not volume:
        print("No device drive found. Hold switch 1 while powering on the device.")
        return 1
    print("Backed up " + volume + " to " + backup(volume))
    return 0


# keep_existing: Paths (prefixes) which are only copied if they do not exist on the device yet
def sync(src, volume, dry_run, keep_existing = ()):
    changed = []
    kept = []
    for rel in list_files(src):
        dst = os.path.join(volume, rel)
        if os.path.isfile(dst):
            if filecmp.cmp(os.path.join(src, rel), dst, shallow = False):
                continue
            if rel.startswith(keep_existing):
                kept.append(rel)
                continue
        changed.append(rel)

    if kept:
        print("Kept the device's own version (use --profiles to overwrite): " + ", ".join(kept))

    extra = [rel for rel in list_files(volume) if not os.path.exists(os.path.join(src, rel)) and rel != "boot_out.txt"]

    # With auto-reload on (CircuitPython without our boot.py), every write restarts code.py. Without a code.py
    # until the end, the device does not run half written firmware during the copy.
    if "code.py" in changed:
        changed = [rel for rel in changed if rel != "code.py"] + ["code.py"]
        if not dry_run and os.path.isfile(os.path.join(volume, "code.py")):
            os.remove(os.path.join(volume, "code.py"))

    for rel in changed:
        print(("would copy " if dry_run else "copy ") + rel)
        if not dry_run:
            dst = os.path.join(volume, rel)
            os.makedirs(os.path.dirname(dst), exist_ok = True)
            shutil.copyfile(os.path.join(src, rel), dst)

    if extra:
        print("Files on the device which are not part of the build (kept): " + ", ".join(extra))

    if not dry_run and changed:
        os.sync()

    return changed


def cmd_deploy(args):
    if cmd_validate(argparse.Namespace(device = args.device)) != 0:
        print("Validation failed, nothing deployed.")
        return 1

    volume = find_volume(args.volume)
    if not volume:
        print("No device drive found. Hold switch 1 while powering on the device.")
        return 1

    with open(os.path.join(volume, "boot_out.txt")) as f:
        print(f.readline().strip())

    out = build(BUILD, args.device)

    if not args.dry_run:
        print("Backup: " + backup(volume))

    # Profiles are user data (edited in the web editor): never overwrite them unless asked to
    keep = () if args.profiles else ("profiles" + os.sep,)
    changed = sync(out, volume, args.dry_run, keep)
    print(("%d file(s) would be copied" if args.dry_run else "%d file(s) copied") % len(changed))
    if changed and not args.dry_run:
        print("Done. Power cycle the device (without holding a switch) to run it.")
    return 0


def cmd_restore(args):
    volume = find_volume(args.volume)
    if not volume:
        print("No device drive found. Hold switch 1 while powering on the device.")
        return 1
    if not os.path.isfile(os.path.join(args.dir, "code.py")):
        print("Not a backup folder: " + args.dir)
        return 1
    sync(args.dir, volume, args.dry_run)
    return 0


def main():
    p = argparse.ArgumentParser(description = "PySwitch multimode tool")
    p.add_argument("--volume", help = "Device drive path (default: auto detect)")
    sub = p.add_subparsers(dest = "cmd", required = True)

    s = sub.add_parser("validate")
    s.add_argument("--device", help = "nano4, mini6 or mc10 (default: all)")
    s.set_defaults(func = cmd_validate)

    s = sub.add_parser("build")
    s.add_argument("--out")
    s.add_argument("--device", help = "Override the device in modes.json")
    s.set_defaults(func = cmd_build)

    s = sub.add_parser("site", help = "Build the web editor with firmware files")
    s.add_argument("--out")
    s.set_defaults(func = cmd_site)

    s = sub.add_parser("serve", help = "Build and serve the web editor on localhost")
    s.add_argument("--port", type = int, default = 8765)
    s.set_defaults(func = cmd_serve)

    s = sub.add_parser("deploy")
    s.add_argument("--device", help = "Override the device in modes.json")
    s.add_argument("--dry-run", action = "store_true")
    s.add_argument("--profiles", action = "store_true", help = "Also overwrite profiles which exist on the device")
    s.set_defaults(func = cmd_deploy)

    s = sub.add_parser("backup")
    s.set_defaults(func = cmd_backup)

    s = sub.add_parser("restore")
    s.add_argument("dir")
    s.add_argument("--dry-run", action = "store_true")
    s.set_defaults(func = cmd_restore)

    args = p.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
