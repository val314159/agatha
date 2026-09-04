#!/usr/bin/env python3
"""Capture webcam frame(s) and run two streaming Ollama passes.

Usage:
  qqqq5.py [--pass2-image] [--loop] [--delay=<seconds>] [--frames=<n>] [--frame-delay=<seconds>]
  qqqq5.py (-h | --help)

Options:
  --pass2-image           Include captured image(s) in pass 2 as well as pass 1.
  --loop                  Run until Ctrl-C.
  --delay=<seconds>       Seconds to wait between loop iterations [default: 0].
  --frames=<n>            Number of sequential frames to capture [default: 1].
  --frame-delay=<seconds> Seconds to wait between captured frames [default: 0.5].
  -h --help               Show this help.
"""

import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

from docopt import docopt


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
MODEL1 = os.getenv("MODEL1", "qwen3-vl:4b")
MODEL2 = os.getenv("MODEL2", "qwen3.6:35b-a3b")

IMAGE_PATH = os.getenv("IMAGE_PATH", "frame.jpg")
VIDEO_DEVICE = os.getenv("VIDEO_DEVICE", "/dev/video0")
VIDEO_SIZE = os.getenv("VIDEO_SIZE", "640x480")
FRAMERATE = os.getenv("FRAMERATE", "30")

COMMON_OPTIONS = {
    "think": False,
    "stream": True,
    "repeat_penalty": 1.2,
    "repeat_last_n": 256,
}

PASS1_PROMPT = """\
Briefly describe these sequential webcam frame(s).
Focus on the user, their posture, activity, expression, and anything they are holding or doing.
If multiple frames are provided, prefer observations about what is consistent or what changed across frames.
Use background only when it clearly affects the moment.
Ignore static room clutter, doors, walls, shelves, drinks, and generic desk objects unless they are unusually important.
Create up to 3 visually grounded candidate spoken lines.
Each candidate must include:
- observation: internal factual analysis
- visual_basis: what in the image supports it
- spoken_line: the exact short line the avatar could say to the user
spoken_line must be literal dialogue, not a description or instruction.
Make spoken_line casual, specific, direct, and under 18 words.
Do not use mechanical intros like "I observe", "it seems", "the image shows", "you appear to", "vibes", or "energy".
Bad spoken_line: "The avatar should say the user looks focused."
Bad spoken_line: "Tell the user they look focused."
Good spoken_line: "You look locked in."
Good spoken_line: "That is some serious debugging posture."
Return only JSON matching the schema.
"""

PASS2_PROMPT = """\
Using the pass 1 image analysis below, produce the final result.
Rate every candidate spoken line from pass 1.
Keep only candidate spoken lines grounded in visual_basis.
Do not rewrite spoken_line except to remove unsafe or clearly broken wording.
Do not invent new jokes or new visual facts.
Prefer jokes about the user's current action, pose, timing, or interaction with the camera.
Do not joke about the background unless it is unusually prominent, surprising, or directly part of the action.
If the only funny material is ordinary background clutter, set say_aloud false.
Score funniness harshly:
0.0 means not funny.
0.3 means mildly amusing but not worth saying.
0.6 means actually funny.
0.8 means unusually funny and worth saying aloud.
Only score above 0.8 if the observation is genuinely strong.
Set say_aloud true only when funniness >= 0.85 and confidence >= 0.75.
Do not make jokes about protected traits, body, gender, race, age, disability, or identity.
Prefer jokes about the immediate situation, timing, or visual irony.
Each candidate_spoken_lines item must include observation, visual_basis, spoken_line, confidence, funniness, and say_aloud.
observation is internal analysis.
spoken_line is what the avatar says directly to the user.
spoken_line must be literal dialogue, not a description or instruction.
Do not write "the avatar should say", "the user should say", "tell the user", or "a funny line would be".
Bad spoken_line: "The avatar should say this looks intense."
Bad spoken_line: "Tell the user they look focused."
Good spoken_line: "You look locked in."
Good spoken_line: "You have the focus of someone hunting a missing semicolon."
If say_aloud is false, spoken_line must be an empty string.
Do not put confidence, funniness, or say_aloud at the top level.
Use candidate_spoken_lines as the top-level list name.
Return only JSON matching the schema.

Pass 1 analysis:
{pass1_text}
"""


def score_schema() -> dict:
    return {"type": "number", "minimum": 0, "maximum": 1}


def observation_schema(*, final: bool) -> dict:
    properties = {
        "observation": {"type": "string"},
        "visual_basis": {"type": "string"},
        "spoken_line": {"type": "string"},
        "confidence": score_schema(),
    }
    if final:
        properties["funniness"] = score_schema()
        properties["say_aloud"] = {"type": "boolean"}

    return {
        "type": "object",
        "required": list(properties),
        "additionalProperties": False,
        "properties": properties,
    }


def response_schema(list_name: str, item_schema: dict) -> dict:
    return {
        "type": "object",
        "required": ["description", list_name],
        "additionalProperties": False,
        "properties": {
            "description": {"type": "string"},
            list_name: {
                "type": "array",
                "maxItems": 3,
                "items": item_schema,
            },
        },
    }


PASS1_SCHEMA = response_schema(
    "candidates",
    observation_schema(final=False),
)
PASS2_SCHEMA = response_schema(
    "candidate_spoken_lines",
    observation_schema(final=True),
)


def parse_args() -> dict:
    args = docopt(__doc__)
    try:
        delay = float(args["--delay"] or 0)
        frame_delay = float(args["--frame-delay"] or 0)
        frames = int(args["--frames"] or 1)
    except ValueError:
        print("--delay, --frame-delay, and --frames must be numbers", file=sys.stderr)
        raise SystemExit(2)
    if frames < 1:
        print("--frames must be at least 1", file=sys.stderr)
        raise SystemExit(2)

    return {
        "loop": args["--loop"],
        "delay": delay,
        "frames": frames,
        "frame_delay": frame_delay,
        "pass2_image": args["--pass2-image"],
    }


def frame_path(index: int, total: int) -> str:
    if total == 1:
        return IMAGE_PATH

    root, ext = os.path.splitext(IMAGE_PATH)
    return f"{root}-{index + 1:03d}{ext or '.jpg'}"


def capture_frame(path: str) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "v4l2",
            "-input_format",
            "mjpeg",
            "-video_size",
            VIDEO_SIZE,
            "-framerate",
            FRAMERATE,
            "-i",
            VIDEO_DEVICE,
            "-frames:v",
            "1",
            path,
        ],
        check=True,
    )


def image_base64(path: str) -> str:
    with open(path, "rb") as image:
        return base64.b64encode(image.read()).decode("ascii")


def capture_frames(total: int, delay: float) -> list[str]:
    paths = []
    for index in range(total):
        path = frame_path(index, total)
        capture_frame(path)
        paths.append(path)
        if index < total - 1 and delay > 0:
            time.sleep(delay)
    return paths


def make_payload(
    *,
    model: str,
    prompt: str,
    schema: dict,
    temperature: float,
    images_b64: list[str] | None = None,
) -> dict:
    message = {"role": "user", "content": prompt}
    if images_b64:
        message["images"] = images_b64

    return {
        **COMMON_OPTIONS,
        "model": model,
        "messages": [message],
        "format": schema,
        "temperature": temperature,
    }


def stream_chat(payload: dict) -> tuple[int, str]:
    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    chunks: list[str] = []
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            for raw_line in response:
                if not raw_line.strip():
                    continue

                chunk = json.loads(raw_line)
                if "error" in chunk:
                    print(f"\nError: {chunk['error']}", file=sys.stderr)
                    return 1, "".join(chunks)

                text = chunk.get("message", {}).get("content", "")
                if text:
                    chunks.append(text)
                    print(text, end="", flush=True)

                if chunk.get("done"):
                    print()
                    return 0, "".join(chunks)
    except Exception as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1, "".join(chunks)

    return 0, "".join(chunks)


def parse_json_object(text: str) -> dict:
    start = text.find("{")
    if start < 0:
        raise ValueError("no JSON object found")

    decoder = json.JSONDecoder()
    result, _ = decoder.raw_decode(text[start:])
    if not isinstance(result, dict):
        raise ValueError("top-level JSON value is not an object")
    return result


def print_spoken_lines(response_text: str) -> None:
    try:
        result = parse_json_object(response_text)
    except (json.JSONDecodeError, ValueError) as exc:
        print(f"Could not parse final JSON: {exc}", file=sys.stderr)
        return

    lines = list(spoken_lines(result))
    if not lines:
        print("\nnothing passed the bar")
        return

    print()
    for line in lines:
        print(line)


def spoken_lines(value: object):
    if isinstance(value, dict):
        if value.get("say_aloud") and value.get("spoken_line"):
            yield value["spoken_line"]
        for child in value.values():
            yield from spoken_lines(child)
    elif isinstance(value, list):
        for child in value:
            yield from spoken_lines(child)


def describe_once(*, frames: int, frame_delay: float, include_pass2_image: bool) -> int:
    try:
        image_paths = capture_frames(frames, frame_delay)
    except subprocess.CalledProcessError as exc:
        print(f"Frame capture failed: ffmpeg exited with {exc.returncode}", file=sys.stderr)
        return 1
    except FileNotFoundError:
        print("Frame capture failed: ffmpeg is not installed or not in PATH", file=sys.stderr)
        return 1

    images_b64 = [image_base64(path) for path in image_paths]

    print("--- pass 1: image candidates ---")
    status, pass1_text = stream_chat(
        make_payload(
            model=MODEL1,
            prompt=PASS1_PROMPT,
            schema=PASS1_SCHEMA,
            temperature=0.2,
            images_b64=images_b64,
        )
    )
    if status:
        return status

    print("--- pass 2: final scoring ---")
    status, pass2_text = stream_chat(
        make_payload(
            model=MODEL2,
            prompt=PASS2_PROMPT.format(pass1_text=pass1_text),
            schema=PASS2_SCHEMA,
            temperature=0.4,
            images_b64=images_b64 if include_pass2_image else None,
        )
    )
    if not status:
        print_spoken_lines(pass2_text)
    return status


def main() -> int:
    args = parse_args()

    if not args["loop"]:
        return describe_once(
            frames=args["frames"],
            frame_delay=args["frame_delay"],
            include_pass2_image=args["pass2_image"],
        )

    frame = 1
    try:
        while True:
            print(f"\n=== frame {frame} ===")
            status = describe_once(
                frames=args["frames"],
                frame_delay=args["frame_delay"],
                include_pass2_image=args["pass2_image"],
            )
            if status:
                return status
            frame += 1
            if args["delay"] > 0:
                time.sleep(args["delay"])
    except KeyboardInterrupt:
        print("\nStopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
