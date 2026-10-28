# VoxyScribe

Voice typing for Windows. Hold a hotkey, talk, let go, and your words appear wherever you're typing. Speech is turned into text on your PC, not in the cloud.

**Website: https://ccherbst.github.io/voxyscribe-releases/**

**[Download the latest version](https://github.com/CCHerbst/voxyscribe-releases/releases/latest)** (Windows 10 or 11, 64-bit)

1. Download the `.msi` file under **Assets** and run it. It installs for your Windows account; no administrator rights needed.
2. Windows may say the installer is from an unknown publisher. Choose **More info**, then **Run anyway**.
3. VoxyScribe starts when the install finishes (after that, from the Start menu). The first time, it downloads its speech model (about 660 MB); the listening bar shows the progress.
4. Hold **Ctrl+Shift+Space**, talk, and let go.

VoxyScribe checks this page once a day and offers each new version. Updates are checked against the SHA-256 listed with the release before they're installed, and VoxyScribe opens again when the update is done.

## Built with

- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) running [Parakeet Unified 0.6B](https://huggingface.co/nvidia/parakeet-unified-en-0.6b), the English speech model, downloaded on first start. Licensed by NVIDIA Corporation under the [NVIDIA Open Model License](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/).
- [Silero VAD](https://github.com/snakers4/silero-vad) on [ONNX Runtime](https://onnxruntime.ai/) to tell speech from silence
- [3D-Speaker ERes2Net](https://www.modelscope.cn/models/iic/speech_eres2net_sv_en_voxceleb_16k) for who is speaking in audio files, downloaded on first use
- [LLamaSharp](https://github.com/SciSharp/LLamaSharp) for the optional AI cleanup (Qwen3 0.6B or Phi-4 Mini, on the processor or any graphics card through Vulkan)
- [Avalonia UI](https://avaloniaui.net/), [NAudio](https://github.com/naudio/NAudio), and .NET 8

This repository holds the releases and the website (`index.html`, `assets/`).
