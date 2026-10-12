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
import shutil
import subprocess
import sys
import time

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
            errs = sim.validate(mode, device)
            print(("OK   " if not errs else "FAIL ") + device + " / " + mode)
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


def version():
    try:
        out = subprocess.check_output(["git", "-C", REPO, "describe", "--always", "--dirty", "--tags"], stderr = subprocess.DEVNULL)
        rev = out.decode().strip()
    except (OSError, subprocess.CalledProcessError):
        rev = "unknown"
    return time.strftime("%Y.%m.%d") + "-" + rev


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

    with open(os.path.join(out, "firmware", "manifest.json"), "w") as f:
        json.dump({"version": ver, "files": files}, f, indent = 1)

    with open(os.path.join(out, "profiles", "index.json"), "w") as f:
        json.dump(sorted(n[:-5] for n in os.listdir(os.path.join(out, "profiles")) if n.endswith(".json") and n not in ("modes.json", "index.json")), f)

    return out


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
