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

@torch.no_grad()
def run_benchmark():
    print("=== MPS Backend RVC Pipeline Benchmark ===")
    
    # 1. Initialize DeviceManager
    device_manager = DeviceManager.get_instance()
    # Force initialize MPS
    device_manager.initialize(-1, force_fp32=False, disable_jit=False)
    device = device_manager.device
    print(f"Device: {device}, FP16 available: {device_manager.use_fp16()}")

    # 2. Load Slot 0 Model
    model_dir = "model_dir"
    slot_mgr = ModelSlotManager.get_instance(model_dir)
    slot_info = slot_mgr.get_slot_info(0)
    if slot_info is None:
        print("Error: Model slot 0 not found. Please upload a model first.")
        return
    
    print(f"Loaded model slot 0: {slot_info.name} (SR: {slot_info.samplingRate})")
    
    # 3. Create Settings & Model instance
    settings = VoiceChangerSettings()
    settings.gpu = -1
    settings.inputSampleRate = 48000
    settings.outputSampleRate = 48000
    settings.f0Detector = "rmvpe"
    settings.serverReadChunkSize = 192
    
    vcmodel = RVCr2(slot_info, settings)
    
    t0 = time.perf_counter()
    vcmodel.initialize()
    print(f"Model initialization took: {(time.perf_counter() - t0)*1000:.2f} ms")
    
    # 4. Realloc buffers
    block_frame = settings.serverReadChunkSize * 128 # 24576
    extra_frame = int(settings.extraConvertSize * settings.inputSampleRate)
    crossfade_frame = int(settings.crossFadeOverlapSize * settings.inputSampleRate)
    sola_search_frame = settings.inputSampleRate // 100
    vcmodel.realloc(block_frame, extra_frame, crossfade_frame, sola_search_frame)
    
    # 5. Perform mock inference with time measurement
    print("\nRunning benchmark trials...")
    
    # Generate dummy input audio (0.5 seconds of float32 audio at 48000Hz)
    audio_len = block_frame
    audio_in = np.random.randn(audio_len).astype(np.float32) * 0.1
    
    # Warmup
    for _ in range(3):
        vcmodel.inference(audio_in)
        
    # Benchmark components
    trials = 10
    total_time = 0
    t_resample_in = 0
    t_pitch = 0
    t_embed = 0
    t_infer = 0
    t_resample_out = 0
    
    # We move resamplers to CPU for this benchmark test
    vcmodel.resampler_in = vcmodel.resampler_in.cpu()
    vcmodel.resampler_out = vcmodel.resampler_out.cpu()
    
    for _ in range(trials):
        # We manually step inside the pipeline to benchmark components
        # (mirroring RVCr2.inference and Pipeline.exec)
        t_start = time.perf_counter()
        
        # Part A: resample in on CPU, then copy to GPU
        t_a = time.perf_counter()
        audio_in_t = torch.as_tensor(audio_in, dtype=torch.float32, device='cpu')
        audio_in_16k_cpu = vcmodel.resampler_in(audio_in_t)
        audio_in_16k = audio_in_16k_cpu.to(device)
        if vcmodel.is_half:
            audio_in_16k = audio_in_16k.half()
        t_resample_in += (time.perf_counter() - t_a)
        
        # Part B: pitch extraction (RMVPE)
        t_b = time.perf_counter()
        f0 = vcmodel.pipeline.pitchExtractor.extract(audio_in_16k, 16000, 128)
        t_pitch += (time.perf_counter() - t_b)
        
        # Part C: embedding (Hubert)
        t_c = time.perf_counter()
        feats = vcmodel.pipeline.embedder.extract_features(audio_in_16k.unsqueeze(0), 9, True)
        feats = torch.cat((feats, feats[:, -1:, :]), 1)
        t_embed += (time.perf_counter() - t_c)
        
        # Part D: generator inference (RVC)
        t_d = time.perf_counter()
        # Scale to match expected length
        audio_feats_len = feats.shape[1] * 2
        feats_scaled = torch.nn.functional.interpolate(feats.permute(0, 2, 1), scale_factor=2, mode='nearest').permute(0, 2, 1).contiguous()
        feats_scaled = feats_scaled[:, :audio_feats_len, :]
        
        p_len = torch.tensor([audio_feats_len], device=device, dtype=torch.int64)
        sid = torch.tensor([0], device=device, dtype=torch.int64)
        
        # Prepare pitch variables matching return length
        pitch = torch.zeros(1, audio_feats_len, device=device, dtype=torch.int64)
        pitchf = torch.zeros(1, audio_feats_len, device=device, dtype=vcmodel.dtype)
        
        # Inference
        audio_model = vcmodel.pipeline.inferencer.infer(
            feats_scaled, p_len, pitch, pitchf, sid, 
            vcmodel.skip_head, vcmodel.return_length, vcmodel.return_length
        ).float()
        t_infer += (time.perf_counter() - t_d)
        
        # Part E: copy to CPU, then resample out on CPU
        t_e = time.perf_counter()
        audio_model_cpu = audio_model.cpu()
        audio_out = vcmodel.resampler_out(audio_model_cpu)
        # Ensure copy to numpy to force execution sync
        audio_out_cpu = audio_out.detach().numpy()
        t_resample_out += (time.perf_counter() - t_e)
        
        total_time += (time.perf_counter() - t_start)
        
    print(f"\nAverage durations over {trials} trials:")
    print(f"  * Resample In (48k -> 16k):  {t_resample_in/trials*1000:.2f} ms")
    print(f"  * Pitch Extraction (RMVPE):   {t_pitch/trials*1000:.2f} ms")
    print(f"  * Embedding (Hubert ONNX):   {t_embed/trials*1000:.2f} ms")
    print(f"  * Generator Inference (RVC): {t_infer/trials*1000:.2f} ms")
    print(f"  * Resample Out (40k -> 48k): {t_resample_out/trials*1000:.2f} ms")
    print(f"  * ----------------------------------------")
    print(f"  * Total Pipeline Duration:   {total_time/trials*1000:.2f} ms")
    print(f"  * Block Audio Length:        {audio_len/48000*1000:.2f} ms")
    
    if (total_time / trials) > (audio_len / 48000):
        print("\nWARNING: Pipeline duration exceeds block audio length! This will cause stuttering/underflow.")
    else:
        print("\nSUCCESS: Pipeline is fast enough for real-time streaming.")

if __name__ == "__main__":
    run_benchmark()
