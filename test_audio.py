import requests

response = requests.post(
    "http://localhost:7778/v1/audio/speech",
    json={
        "model": "hexgrad/Kokoro-82M",
        "input": "Hello world with custom parameters.",
        "voice": "af_heart",
        "speed": 1.0,
        "params": {
            "pitch_up_key": "2",
            "index_path": "CaitArcane/added_IVF65_Flat_nprobe_1_CaitArcane_v2",
        },
    },
)

audio = response.content
with open("audio.mp3", "wb") as f:
    f.write(audio)
