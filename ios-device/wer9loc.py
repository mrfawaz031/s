#!/usr/bin/env python3
"""
wer9loc — device-wide iOS location controller.

Changes the GPS location the ENTIRE iPhone reports (all apps, not just the
browser) by driving Apple's own developer location-simulation service through
the open-source `pymobiledevice3` toolkit. This is the same mechanism Xcode's
"Simulate Location" uses.

Honest scope
------------
* Requires a computer (macOS / Linux / Windows) and a USB cable. iOS does not
  allow any standalone app to change the whole device's location without either
  this developer path or a jailbreak — that is an Apple sandbox rule, not a
  limitation of this tool.
* The simulated location holds while this tool (and, on iOS 17+, the tunnel)
  keeps running. `hold` keeps it pinned until you press Ctrl+C, which restores
  the real GPS. That is as close to "stays until I turn it off" as iOS allows
  without a jailbreak.
* Nothing here is "undetectable": apps can still cross-check IP / Wi-Fi and can
  detect Developer Mode. Use this on your own device for development, testing,
  and privacy.

Usage
-----
  python3 wer9loc.py status
  python3 wer9loc.py search "Eiffel Tower"
  python3 wer9loc.py set   --lat 48.8584 --lng 2.2945
  python3 wer9loc.py set   --place "Times Square, New York"
  python3 wer9loc.py hold  --lat 48.8584 --lng 2.2945      # pin until Ctrl+C
  python3 wer9loc.py route --from 48.8584,2.2945 --to 48.8606,2.3376 --speed 6
  python3 wer9loc.py route --gpx mywalk.gpx
  python3 wer9loc.py clear

iOS 17+ note
------------
Start the tunnel once in a separate terminal (needs root), then run commands:
  sudo python3 wer9loc.py tunnel        # keep this running
  python3 wer9loc.py set --lat .. --lng ..
"""
import argparse
import asyncio
import json
import math
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

# ---------------------------------------------------------------------------
# Locating the pymobiledevice3 CLI
# ---------------------------------------------------------------------------

def pmd_cmd():
    """Return the base command list to invoke pymobiledevice3."""
    exe = shutil.which("pymobiledevice3")
    if exe:
        return [exe]
    # Fall back to the module in the current interpreter.
    return [sys.executable, "-m", "pymobiledevice3"]


def run(cmd, check=True, capture=False):
    """Run a subprocess, streaming or capturing output."""
    if capture:
        return subprocess.run(cmd, check=check, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return subprocess.run(cmd, check=check)


# ---------------------------------------------------------------------------
# Device discovery
# ---------------------------------------------------------------------------

async def _discover():
    from pymobiledevice3.usbmux import list_devices
    from pymobiledevice3.lockdown import create_using_usbmux

    devices = await list_devices()
    if not devices:
        return None
    udid = devices[0].serial
    version = "?"
    try:
        ld = await create_using_usbmux(serial=udid)
        version = getattr(ld, "product_version", None)
        if not version:
            version = ld.all_values.get("ProductVersion", "?")
    except Exception:
        pass
    return udid, version


def find_device():
    """Return (udid, product_version) of the first connected device, or None.

    Returns None when no device is present OR the usb daemon isn't running
    (usbmuxd on Linux, Apple Mobile Device Support on Windows, built in on macOS).
    """
    try:
        import pymobiledevice3  # noqa: F401
    except Exception as e:
        sys.exit("error: pymobiledevice3 is not installed. Run: "
                 "pip install -r requirements.txt\n(%s)" % e)
    try:
        return asyncio.run(_discover())
    except Exception:
        return None


def version_ge(version, major):
    try:
        return int(version.split(".")[0]) >= major
    except Exception:
        return False


def ensure_developer_ready(udid, version):
    """Mount the Developer Disk Image; on iOS 17+ Developer Mode must be on."""
    base = pmd_cmd()
    print("• Mounting Developer Disk Image (if needed)…")
    # auto-mount downloads/mounts the correct image for the device.
    run(base + ["mounter", "auto-mount"], check=False)


def tunnel_args(udid, version, rsd):
    """Extra flags for simulate-location on iOS 17+ (RSD/tunnel selection)."""
    if rsd:
        host, port = rsd
        return ["--rsd", host, str(port)]
    if version_ge(version, 17):
        return ["--tunnel", udid]
    return []


# ---------------------------------------------------------------------------
# Geocoding (place name -> coordinates) via OpenStreetMap Nominatim
# ---------------------------------------------------------------------------

def geocode(place):
    url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + \
        urllib.parse.quote(place)
    req = urllib.request.Request(url, headers={"User-Agent": "wer9loc/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
    except Exception as e:
        sys.exit("error: geocoding failed (network?): %s\n"
                 "Tip: pass --lat/--lng directly instead of --place." % e)
    if not data:
        sys.exit("error: no match for place: %s" % place)
    return float(data[0]["lat"]), float(data[0]["lon"]), data[0].get("display_name", "")


def resolve_coords(args):
    if getattr(args, "place", None):
        lat, lng, name = geocode(args.place)
        print("• %s\n  -> %.6f, %.6f" % (name, lat, lng))
        return lat, lng
    if args.lat is None or args.lng is None:
        sys.exit("error: provide --lat/--lng or --place")
    return float(args.lat), float(args.lng)


# ---------------------------------------------------------------------------
# GPX generation for route playback
# ---------------------------------------------------------------------------

def haversine(a, b):
    R = 6371000.0
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def make_gpx(start, end, speed_ms):
    """Straight-line route between two points, one trackpoint per second."""
    dist = haversine(start, end)
    steps = max(2, int(dist / max(0.5, speed_ms)))
    pts = []
    t0 = time.time()
    for i in range(steps + 1):
        f = i / steps
        lat = start[0] + (end[0] - start[0]) * f
        lng = start[1] + (end[1] - start[1]) * f
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t0 + i))
        pts.append('   <trkpt lat="%.6f" lon="%.6f"><time>%s</time></trkpt>' % (lat, lng, ts))
    gpx = ('<?xml version="1.0"?>\n<gpx version="1.1" creator="wer9loc">\n'
           ' <trk><name>wer9loc route</name><trkseg>\n'
           + "\n".join(pts) + "\n </trkseg></trk>\n</gpx>\n")
    fd, path = tempfile.mkstemp(suffix=".gpx", prefix="wer9loc_")
    with os.fdopen(fd, "w") as f:
        f.write(gpx)
    return path, dist, steps


# ---------------------------------------------------------------------------
# Simulate-location command builders (shared by all commands)
# ---------------------------------------------------------------------------

def _sim_group(version):
    """iOS 17+ uses the DVT instruments channel (Apple removed the old lockdown
    service). Older iOS keeps the classic developer service."""
    if version_ge(version, 17):
        return ["developer", "dvt", "simulate-location"]
    return ["developer", "simulate-location"]


def sim_set_cmd(udid, version, rsd, lat, lng):
    return pmd_cmd() + _sim_group(version) + ["set"] + \
        tunnel_args(udid, version, rsd) + ["--", str(lat), str(lng)]


def sim_clear_cmd(udid, version, rsd):
    return pmd_cmd() + _sim_group(version) + ["clear"] + \
        tunnel_args(udid, version, rsd)


def sim_play_cmd(udid, version, rsd, gpx_path):
    # timing_randomness_range (0) is required by the CLI's play command.
    return pmd_cmd() + _sim_group(version) + ["play"] + \
        tunnel_args(udid, version, rsd) + [gpx_path, "0"]


def pin_location(udid, version, rsd, lat, lng, interval=15):
    """Set the location and hold it until interrupted, then restore real GPS.

    iOS 17+: the DVT `set` command sets the location and then blocks (holds)
    until Enter/Ctrl+C — closing it restores real GPS. iOS <17: re-assert in a
    loop (the old service returns immediately)."""
    if version_ge(version, 17):
        print("• Location set -> %.6f, %.6f" % (lat, lng))
        print("  Keep this window OPEN. Press ENTER or Ctrl+C here to stop and restore real GPS.")
        try:
            run(sim_set_cmd(udid, version, rsd, lat, lng), check=False)
        except KeyboardInterrupt:
            pass
        run(sim_clear_cmd(udid, version, rsd), check=False)
        print("✓ Restored real location.")
    else:
        hold_loop(udid, version, rsd, lat, lng, interval)


def hold_loop(udid, version, rsd, lat, lng, interval):
    """Pin a location, re-asserting every `interval` s until Ctrl+C, then clear."""
    set_cmd = sim_set_cmd(udid, version, rsd, lat, lng)
    clr_cmd = sim_clear_cmd(udid, version, rsd)

    stop = {"flag": False}
    def _sig(*_):
        stop["flag"] = True
    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    print("• Pinning location -> %.6f, %.6f" % (lat, lng))
    print("  Keep this window OPEN. Press Ctrl+C to stop and restore real GPS.")
    interval = max(5, int(interval))
    try:
        while not stop["flag"]:
            run(set_cmd, check=False)
            for _ in range(interval):
                if stop["flag"]:
                    break
                time.sleep(1)
    finally:
        print("\n• Restoring real location…")
        run(clr_cmd, check=False)
        print("✓ Cleared.")


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_status(args):
    dev = find_device()
    if not dev:
        print("No iPhone/iPad detected over USB.")
        print("• Connect the device, unlock it, and tap 'Trust' if prompted.")
        return
    udid, version = dev
    print("Device connected:")
    print("  UDID:            %s" % udid)
    print("  iOS version:     %s" % version)
    if version_ge(version, 17):
        print("  Mode:            iOS 17+ — a tunnel is required.")
        print("                   In another terminal run:  sudo %s tunnel" % os.path.basename(sys.argv[0]))
        print("                   (enable Settings > Privacy & Security > Developer Mode)")
    else:
        print("  Mode:            iOS < 17 — direct (no tunnel needed).")


def cmd_set(args):
    dev = find_device()
    if not dev:
        sys.exit("error: no device connected (run: status).")
    udid, version = dev
    lat, lng = resolve_coords(args)
    ensure_developer_ready(udid, version)
    if version_ge(version, 17):
        # On iOS 17+ the location holds only while the DVT session runs.
        pin_location(udid, version, args.rsd, lat, lng)
    else:
        print("• Setting location -> %.6f, %.6f" % (lat, lng))
        run(sim_set_cmd(udid, version, args.rsd, lat, lng))
        print("✓ Location set. It stays until you run `clear`.")


def cmd_hold(args):
    dev = find_device()
    if not dev:
        sys.exit("error: no device connected (run: status).")
    udid, version = dev
    lat, lng = resolve_coords(args)
    ensure_developer_ready(udid, version)
    pin_location(udid, version, args.rsd, lat, lng, args.interval)


def cmd_route(args):
    dev = find_device()
    if not dev:
        sys.exit("error: no device connected (run: status).")
    udid, version = dev
    ensure_developer_ready(udid, version)

    if args.gpx:
        gpx_path = args.gpx
        print("• Playing GPX: %s" % gpx_path)
    else:
        if not (args.frm and args.to):
            sys.exit("error: provide --gpx, or both --from and --to")
        start = tuple(float(x) for x in args.frm.split(","))
        end = tuple(float(x) for x in args.to.split(","))
        gpx_path, dist, steps = make_gpx(start, end, float(args.speed))
        print("• Route %.0f m at %.1f m/s (%d points)" % (dist, float(args.speed), steps))
    run(sim_play_cmd(udid, version, args.rsd, gpx_path))
    print("✓ Route finished.")


def cmd_clear(args):
    dev = find_device()
    if not dev:
        sys.exit("error: no device connected.")
    udid, version = dev
    run(sim_clear_cmd(udid, version, args.rsd), check=False)
    print("✓ Real location restored.")


def cmd_search(args):
    lat, lng, name = geocode(" ".join(args.query))
    print("%s\n%.6f, %.6f" % (name, lat, lng))


def cmd_tunnel(args):
    """Convenience wrapper for `pymobiledevice3 remote tunneld` (iOS 17+)."""
    print("• Starting tunneld (requires root/Administrator). Keep this window open.")
    run(pmd_cmd() + ["remote", "tunneld"], check=False)


# ---------------------------------------------------------------------------
# Interactive menu (double-click friendly)
# ---------------------------------------------------------------------------

def _pause():
    try:
        input("\nPress Enter to close…")
    except (EOFError, KeyboardInterrupt):
        pass


def _parse_coords(raw):
    parts = raw.replace(" ", "").split(",")
    if len(parts) == 2:
        try:
            return float(parts[0]), float(parts[1])
        except ValueError:
            return None
    return None


def _prompt_coords(label=""):
    tag = (" (%s)" % label) if label else ""
    raw = input("Enter a place name, or 'lat,lng'%s: " % tag).strip()
    if not raw:
        return None
    coords = _parse_coords(raw)
    if coords:
        return coords
    try:
        lat, lng, name = geocode(raw)
        print("  -> %s\n     %.6f, %.6f" % (name, lat, lng))
        return lat, lng
    except SystemExit:
        print("  Could not look up that name (network?). Type coordinates as 'lat,lng'.")
        return None


def cmd_menu(_):
    print("=" * 50)
    print("   wer9loc — iPhone location controller")
    print("=" * 50)
    dev = find_device()
    if not dev:
        print("\nNo iPhone detected over USB.")
        print("  1) Connect the iPhone with a USB cable.")
        print("  2) Unlock it and tap 'Trust This Computer'.")
        print("  3) Windows: install Apple Mobile Device Support (comes with iTunes).")
        print("     Linux:   sudo apt install usbmuxd")
        _pause()
        return
    udid, version = dev
    print("\nConnected:  iOS %s   (UDID %s)" % (version, udid))

    if version_ge(version, 17):
        print("\n[iOS 17+] A tunnel must already be running in a SEPARATE window:")
        print("   Windows:      double-click  wer9loc-tunnel.bat  (allow Administrator)")
        print("   macOS/Linux:  sudo python3 wer9loc.py tunnel")
        print("Also enable:  Settings > Privacy & Security > Developer Mode.")
        ans = input("\nIs the tunnel running now? [y/N]: ").strip().lower()
        if ans not in ("y", "yes"):
            print("→ Start the tunnel first, then run this again.")
            _pause()
            return

    while True:
        print("\n--- Menu ---")
        print("  1) Set / pin a location")
        print("  2) Simulate a moving route")
        print("  3) Stop and restore the real location")
        print("  4) Quit")
        choice = input("Choose [1-4]: ").strip()

        if choice == "1":
            coords = _prompt_coords()
            if not coords:
                continue
            lat, lng = coords
            ensure_developer_ready(udid, version)
            # pin_location holds the location until you press Enter/Ctrl+C,
            # then restores the real GPS.
            pin_location(udid, version, None, lat, lng, 15)

        elif choice == "2":
            a = _prompt_coords("START")
            if not a:
                continue
            b = _prompt_coords("END")
            if not b:
                continue
            try:
                speed = float(input("Speed in m/s [5]: ").strip() or "5")
            except ValueError:
                speed = 5.0
            ensure_developer_ready(udid, version)
            gpx_path, dist, steps = make_gpx(a, b, speed)
            print("• Route %.0f m at %.1f m/s (%d points)…" % (dist, speed, steps))
            run(sim_play_cmd(udid, version, None, gpx_path), check=False)
            print("✓ Route finished.")

        elif choice == "3":
            run(sim_clear_cmd(udid, version, None), check=False)
            print("✓ Real location restored.")

        elif choice == "4":
            break
        else:
            print("Invalid choice.")


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def rsd_pair(value):
    host, port = value.split(":")
    return (host, int(port))


def build_parser():
    p = argparse.ArgumentParser(
        prog="wer9loc",
        description="Device-wide iOS location controller (via pymobiledevice3).")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_common(sp):
        sp.add_argument("--rsd", type=rsd_pair, metavar="HOST:PORT",
                        help="RSD host:port from a running tunnel (iOS 17+).")

    sp = sub.add_parser("status", help="Show connected device + mode.")
    sp.set_defaults(func=cmd_status)

    sp = sub.add_parser("set", help="Set a fixed location.")
    sp.add_argument("--lat", type=float); sp.add_argument("--lng", type=float)
    sp.add_argument("--place", help="Place name to geocode instead of lat/lng.")
    add_common(sp); sp.set_defaults(func=cmd_set)

    sp = sub.add_parser("hold", help="Pin a location until Ctrl+C (then restore).")
    sp.add_argument("--lat", type=float); sp.add_argument("--lng", type=float)
    sp.add_argument("--place")
    sp.add_argument("--interval", type=int, default=15,
                    help="Re-assert every N seconds (default 15).")
    add_common(sp); sp.set_defaults(func=cmd_hold)

    sp = sub.add_parser("route", help="Move along a route (GPX or from/to).")
    sp.add_argument("--gpx", help="Path to a GPX file to replay.")
    sp.add_argument("--from", dest="frm", help="Start 'lat,lng'.")
    sp.add_argument("--to", help="End 'lat,lng'.")
    sp.add_argument("--speed", default=5.0, help="Speed in m/s (default 5).")
    add_common(sp); sp.set_defaults(func=cmd_route)

    sp = sub.add_parser("clear", help="Stop simulation, restore real GPS.")
    add_common(sp); sp.set_defaults(func=cmd_clear)

    sp = sub.add_parser("search", help="Geocode a place name to coordinates.")
    sp.add_argument("query", nargs="+"); sp.set_defaults(func=cmd_search)

    sp = sub.add_parser("tunnel", help="Start the iOS 17+ tunnel (run with sudo).")
    sp.set_defaults(func=cmd_tunnel)

    return p


def main():
    argv = sys.argv[1:]
    if not argv:
        # No arguments → launch the friendly interactive menu.
        return cmd_menu(None)
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
