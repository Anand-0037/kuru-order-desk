"""Make one Sarvam chat completion using SARVAM_API_KEY from the environment."""

import os
from pathlib import Path

from sarvamai import SarvamAI


def load_local_key() -> None:
    """Expose the project's .env key to this process without another dependency."""
    if os.environ.get("SARVAM_API_KEY"):
        return
    env_file = Path(__file__).with_name(".env")
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "SARVAM_API_KEY":
            os.environ["SARVAM_API_KEY"] = value.strip().strip('"\'')
            return


load_local_key()
api_key = os.environ.get("SARVAM_API_KEY")
if not api_key:
    raise SystemExit("Add SARVAM_API_KEY to .env before running this script.")

client = SarvamAI(api_subscription_key=api_key)
response = client.chat.completions(
    model="sarvam-105b-conversations",
    messages=[{"role": "user", "content": "In one sentence, what is a limit order?"}],
)
print(response.choices[0].message.content)
