# Synthetic media fixtures
`many-keyframes-h264.mp4.b64` is a generated solid-color 32×32 H.264 MP4, 56 seconds, 2 fps, closed one-second GOPs, no audio. It contains no user footage. Reproduce with:
```sh
ffmpeg -f lavfi -i 'color=c=blue:s=32x32:r=2:d=56' -c:v libx264 -pix_fmt yuv420p -g 2 -keyint_min 2 -sc_threshold 0 -bf 0 -an -movflags +faststart many.mp4
base64 < many.mp4 > many-keyframes-h264.mp4.b64
```
CI decodes the fixture directly; no ffmpeg dependency is added. The 56-file test exercises real output and pagination, not large-file throughput.
