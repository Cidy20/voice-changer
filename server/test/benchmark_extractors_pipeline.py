import sys
import os
import time
import torch
import numpy as np

# Setup paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)
os.chdir(PROJECT_ROOT)

from voice_changer.common.deviceManager.DeviceManager import DeviceManager
from voice_changer.ModelSlotManager import ModelSlotManager
from voice_changer.RVC.RVCr2 import RVCr2
from voice_changer.VoiceChangerSettings import VoiceChangerSettings

TRIALS = 6
CHUNK_SIZE_500MS = 188 # 188 * 128 = 24064 samples at 48kHz (~501ms)

@torch.no_grad()
def run_benchmark():
    print("=========================================================================")
    print("   FCPE Extractor Variants Benchmark: 500ms Chunk & Extra Sweeps         ")
    print("=========================================================================")
    print(f"Testing chunk size: {CHUNK_SIZE_500MS * 128} samples (~500ms at 48kHz)")
    print(f"Trials per configuration: {TRIALS}\n")

    # 1. Initialize DeviceManager
    device_manager = DeviceManager.get_instance()
    # Force initialize MPS for base testing
    device_manager.initialize(-1, force_fp32=True, disable_jit=False)
    device = device_manager.device
    original_provider_func = device_manager.get_onnx_execution_provider

    # 2. Load Slot 0 Model
    model_dir = "model_dir"
    slot_mgr = ModelSlotManager.get_instance(model_dir)
    slot_info = slot_mgr.get_slot_info(0)
    if slot_info is None:
        print("Error: Model slot 0 not found. Please upload a model first.")
        return

    # Generate base settings
    settings = VoiceChangerSettings()
    settings.gpu = -1
    settings.inputSampleRate = 48000
    settings.outputSampleRate = 48000
    settings.serverReadChunkSize = CHUNK_SIZE_500MS

    # Configurations list
    # (Mode Name, Detector ID, ONNX Provider override lambda or None)
    configs = [
        (
            "FCPE (PyTorch + MPS)",
            "fcpe",
            None
        ),
        (
            "FCPE-onnx CPU",
            "fcpe_onnx",
            lambda: (["CPUExecutionProvider"], [{"intra_op_num_threads": 8}])
        ),
        (
            "FCPE-onnx CoreML",
            "fcpe_onnx",
            lambda: (["CoreMLExecutionProvider", "CPUExecutionProvider"], [{"coreml_flags": 4}, {}])
        )
    ]

    extra_list = [1.0, 1.5, 2.0, 2.5, 2.7]

    print("| Extractor Config | Extra Size | Hubert Latency | Pitch Latency | RVC Latency | Total Pipeline | CPU Use |")
    print("| :---             | :---:      | :---:          | :---:         | :---:       | :---:          | :---:   |")

    for mode_name, detector_id, provider_patch in configs:
        # Apply ONNX provider patch if needed
        if provider_patch is not None:
            device_manager.get_onnx_execution_provider = provider_patch
        else:
            device_manager.get_onnx_execution_provider = original_provider_func

        settings.f0Detector = detector_id
        
        # Instantiate and initialize model for this configuration
        # This triggers model reload & detector session creation
        vcmodel = RVCr2(slot_info, settings)
        vcmodel.initialize(force_reload=True)

        # Offload resamplers to CPU for optimal MPS performance
        vcmodel.resampler_in = vcmodel.resampler_in.cpu()
        vcmodel.resampler_out = vcmodel.resampler_out.cpu()

        for extra in extra_list:
            settings.extraConvertSize = extra

            # Reallocate buffers for this extraConvertSize
            block_frame = settings.serverReadChunkSize * 128
            extra_frame = int(settings.extraConvertSize * settings.inputSampleRate)
            crossfade_frame = int(settings.crossFadeOverlapSize * settings.inputSampleRate)
            sola_search_frame = settings.inputSampleRate // 100
            vcmodel.realloc(block_frame, extra_frame, crossfade_frame, sola_search_frame)

            # Generate dynamic size audio
            dynamic_audio_len = int(vcmodel.convert_feature_size_16k * 80 * 3)
            audio_in = np.random.randn(dynamic_audio_len).astype(np.float32) * 0.1

            # Warmup
            for _ in range(1):
                vcmodel.inference(audio_in)

            # Benchmark
            t_start_wall = time.perf_counter()
            t_start_cpu = time.process_time()

            t_embed = 0
            t_pitch = 0
            t_infer = 0

            for _ in range(TRIALS):
                # Simulated pipeline execution mirroring Pipeline.exec
                # A. Resample and copy to device
                audio_in_t = torch.as_tensor(audio_in, dtype=torch.float32, device='cpu')
                audio_in_16k_cpu = vcmodel.resampler_in(audio_in_t)
                audio_in_16k = audio_in_16k_cpu.to(device)

                # B. Pitch Extraction (benchmarked component)
                t_p_start = time.perf_counter()
                f0 = vcmodel.pipeline.pitchExtractor.extract(audio_in_16k, 16000, 128)
                t_pitch += (time.perf_counter() - t_p_start)

                # C. Hubert Embedder (benchmarked component)
                t_e_start = time.perf_counter()
                feats = vcmodel.pipeline.embedder.extract_features(audio_in_16k.unsqueeze(0), 9, True)
                feats = torch.cat((feats, feats[:, -1:, :]), 1)
                t_embed += (time.perf_counter() - t_e_start)

                # D. RVC Generator Inference (benchmarked component)
                t_i_start = time.perf_counter()
                audio_feats_len = vcmodel.convert_feature_size_16k
                feats_scaled = torch.nn.functional.interpolate(
                    feats.permute(0, 2, 1), 
                    size=audio_feats_len, 
                    mode='nearest'
                ).permute(0, 2, 1).contiguous()
                p_len = torch.tensor([audio_feats_len], device=device, dtype=torch.int64)
                sid = torch.tensor([0], device=device, dtype=torch.int64)
                pitch = torch.zeros(1, audio_feats_len, device=device, dtype=torch.int64)
                pitchf = torch.zeros(1, audio_feats_len, device=device, dtype=vcmodel.dtype)

                audio_model = vcmodel.pipeline.inferencer.infer(
                    feats_scaled, p_len, pitch, pitchf, sid, 
                    vcmodel.skip_head, vcmodel.return_length, vcmodel.return_length
                ).float()
                t_infer += (time.perf_counter() - t_i_start)

                # E. Copy and resample out
                audio_model_cpu = audio_model.cpu()
                audio_out = vcmodel.resampler_out(audio_model_cpu)
                audio_out_cpu = audio_out.detach().numpy()

            t_end_wall = time.perf_counter()
            t_end_cpu = time.process_time()

            wall_duration = t_end_wall - t_start_wall
            cpu_duration = t_end_cpu - t_start_cpu

            avg_embed = (t_embed / TRIALS) * 1000
            avg_pitch = (t_pitch / TRIALS) * 1000
            avg_infer = (t_infer / TRIALS) * 1000
            avg_pipeline = (wall_duration / TRIALS) * 1000
            cpu_percent = (cpu_duration / wall_duration) * 100 if wall_duration > 0 else 0

            print(f"| {mode_name:<16} | {extra:>10.1f} | {avg_embed:>12.2f} ms | {avg_pitch:>12.2f} ms | {avg_infer:>9.2f} ms | {avg_pipeline:>12.2f} ms | {cpu_percent:>6.1f}% |")

    # Restore original provider function at the end
    device_manager.get_onnx_execution_provider = original_provider_func
    print("=========================================================================")

if __name__ == "__main__":
    run_benchmark()
