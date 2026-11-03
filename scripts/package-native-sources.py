"""Package the exact upstream Pedalboard source including checked-out submodules.

Clone first with:
git clone --branch v0.9.26 --depth 1 --recurse-submodules --shallow-submodules \
    https://github.com/spotify/pedalboard.git .guitarsim/runtime-source/pedalboard
If the pybind11 SSH remote is unavailable, set that local submodule URL to
https://github.com/pybind/pybind11.git and rerun submodule update --init --recursive.
"""

import pathlib
import subprocess
import tarfile
import json

root = pathlib.Path(__file__).resolve().parents[1]
source = root / ".guitarsim/runtime-source/pedalboard"
if not (source / "setup.py").is_file():
    raise SystemExit("Upstream source checkout is missing.")
status = subprocess.check_output(
    ["git", "-C", str(source), "submodule", "status", "--recursive"], text=True
)
if any(line and line[0] in "-+U" for line in status.splitlines()):
    raise SystemExit(
        "Submodules are incomplete or differ from the pinned source commit."
    )
commit = subprocess.check_output(
    ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
).strip()
destination = root / "release/Selah-native-upstream-source.tar.gz"
destination.parent.mkdir(exist_ok=True)


def include(info):
    if (
        ".git" in pathlib.PurePosixPath(info.name).parts
        or "__pycache__" in pathlib.PurePosixPath(info.name).parts
    ):
        return None
    return info


with tarfile.open(destination, "w:gz", compresslevel=6) as archive:
    archive.add(source, arcname="pedalboard-0.9.26", filter=include)
    archive.add(root / "native", arcname="selah-native", filter=include)
    archive.add(
        root / "scripts/build-native.mjs", arcname="selah-build/build-native.mjs"
    )
    archive.add(root / "THIRD_PARTY_NOTICES.md", arcname="THIRD_PARTY_NOTICES.md")
print(
    json.dumps(
        {
            "archive": str(destination),
            "pedalboardCommit": commit,
            "submodules": status.splitlines(),
            "bytes": destination.stat().st_size,
        },
        indent=2,
    )
)
