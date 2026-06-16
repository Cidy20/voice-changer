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

# We use FCPE for testing since it is the optimal MPS detector
F0_DETECTOR = "fcpe"
TRIALS_PER_SWEEP = 6

@torch.no_grad()
def run_sweep():
    print("=========================================================================")
    print("      RVC Pipeline Parameter Sweep: extraConvertSize & JIT Analysis      ")
    print("=========================================================================")
    print(f"F0 Detector: {F0_DETECTOR} (MPS), Trials per parameter: {TRIALS_PER_SWEEP}")
    print("Please wait, executing parameter sweep...\n")

    # 1. Initialize DeviceManager
    device_manager = DeviceManager.get_instance()
    device_manager.initialize(-1, force_fp32=True, disable_jit=False)
    device = device_manager.device

    # 2. Load Slot 0 Model
    model_dir = "model_dir"
    slot_mgr = ModelSlotManager.get_instance(model_dir)
    slot_info = slot_mgr.get_slot_info(0)
    if slot_info is None:
        print("Error: Model slot 0 not found. Please upload a model first.")
        return

    # Generate dummy input settings
    settings = VoiceChangerSettings()
    settings.gpu = -1
    settings.inputSampleRate = 48000
    settings.outputSampleRate = 48000
    settings.f0Detector = F0_DETECTOR
    settings.serverReadChunkSize = 192

    print("| JIT Active | Extra Size | Hubert Latency | RVC Latency | Total Pipeline | CPU Use |")
    print("| :---:      | :---:      | :---:          | :---:       | :---:          | :---:   |")

    # We sweep JIT: Enabled (disable_jit=False) and Disabled (disable_jit=True)
    for jit_status in [True, False]: # True means JIT active, False means JIT disabled
        disable_jit = not jit_status
        
        # Re-initialize model to trigger or skip JIT compilation
        device_manager.initialize(-1, force_fp32=True, disable_jit=disable_jit)
        vcmodel = RVCr2(slot_info, settings)
        vcmodel.initialize()
        
        # Offload resamplers to CPU as per our latest MPS optimization
        vcmodel.resampler_in = vcmodel.resampler_in.cpu()
        vcmodel.resampler_out = vcmodel.resampler_out.cpu()

        # Sweep extraConvertSize from 0.7 to 2.7 step 0.1
        for extra in np.arange(0.7, 2.75, 0.1):
            settings.extraConvertSize = extra
            
            # Realloc buffers for new extra size
            block_frame = settings.serverReadChunkSize * 128
            extra_frame = int(settings.extraConvertSize * settings.inputSampleRate)
            crossfade_frame = int(settings.crossFadeOverlapSize * settings.inputSampleRate)
            sola_search_frame = settings.inputSampleRate // 100
            vcmodel.realloc(block_frame, extra_frame, crossfade_frame, sola_search_frame)

            # Fix input data dimension to match the exact convert size allocated
            # convert_size_16k is allocated inside realloc. 48kHz audio len = convert_size_16k * 3
            dynamic_audio_len = int(vcmodel.convert_feature_size_16k * 80 * 3)
            audio_in = np.random.randn(dynamic_audio_len).astype(np.float32) * 0.1

            # Warmup
            for _ in range(1):
                vcmodel.inference(audio_in)

            # Benchmark
            t_start_wall = time.perf_counter()
            t_start_cpu = time.process_time()
            
            t_embed = 0
            t_infer = 0

            for _ in range(TRIALS_PER_SWEEP):
                audio_in_t = torch.as_tensor(audio_in, dtype=torch.float32, device='cpu')
                audio_in_16k_cpu = vcmodel.resampler_in(audio_in_t)
                audio_in_16k = audio_in_16k_cpu.to(device)
                
                # Hubert Embedder
                t_c = time.perf_counter()
                feats = vcmodel.pipeline.embedder.extract_features(audio_in_16k.unsqueeze(0), 9, True)
                feats = torch.cat((feats, feats[:, -1:, :]), 1)
                t_embed += (time.perf_counter() - t_c)
                
                # Generator Inference (RVC)
                t_d = time.perf_counter()
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
                t_infer += (time.perf_counter() - t_d)
                
                # Resample out
                audio_model_cpu = audio_model.cpu()
                audio_out = vcmodel.resampler_out(audio_model_cpu)
                audio_out_cpu = audio_out.detach().numpy()

            t_end_wall = time.perf_counter()
            t_end_cpu = time.process_time()

            wall_duration = t_end_wall - t_start_wall
            cpu_duration = t_end_cpu - t_start_cpu
            
            avg_embed = (t_embed / TRIALS_PER_SWEEP) * 1000
            avg_infer = (t_infer / TRIALS_PER_SWEEP) * 1000
            avg_pipeline = (wall_duration / TRIALS_PER_SWEEP) * 1000
            cpu_percent = (cpu_duration / wall_duration) * 100 if wall_duration > 0 else 0
            
            jit_text = "Enabled" if jit_status else "Disabled"
            print(f"| {jit_text:<10} | {extra:>10.1f} | {avg_embed:>12.2f} ms | {avg_infer:>9.2f} ms | {avg_pipeline:>12.2f} ms | {cpu_percent:>6.1f}% |")

    print("=========================================================================")

if __name__ == "__main__":
    run_sweep()
