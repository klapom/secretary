"""Patch vLLM Anthropic streaming converter for tool-call deduplication.

Bug: qwen3_xml parser sets tool_call.id on every streaming delta. The
Anthropic converter interprets each delta with an id as a NEW tool call,
creating a new content_block_start per chunk. Result: first block gets
name="Bash" with empty input, actual arguments scatter across orphaned
blocks with name=null.

Fix: Track current_tool_call_id and only create a new content block when
the id actually changes.
"""
import sys

TARGET = "/usr/local/lib/python3.12/dist-packages/vllm/entrypoints/anthropic/serving.py"

with open(TARGET, "r") as f:
    content = f.read()

if "current_tool_call_id" in content:
    print("Already patched — skipping")
    sys.exit(0)

old_init = "content_block_index = 0\n            content_block_started = False"
new_init = "content_block_index = 0\n            content_block_started = False\n            current_tool_call_id = None"

old_check = "if tool_call.id is not None:"
new_check = (
    "if tool_call.id is not None and tool_call.id != current_tool_call_id:\n"
    "                                current_tool_call_id = tool_call.id"
)

if old_init not in content:
    print("ERROR: Could not find init block to patch", file=sys.stderr)
    sys.exit(1)
if old_check not in content:
    print("ERROR: Could not find check block to patch", file=sys.stderr)
    sys.exit(1)

content = content.replace(old_init, new_init)
content = content.replace(old_check, new_check)

with open(TARGET, "w") as f:
    f.write(content)

print("Anthropic streaming tool-call patch applied successfully")
