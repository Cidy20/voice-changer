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
from voice_changer.pitch_extractor.RMVPEPitchExtractor import RMVPEPitchExtractor
from voice_changer.pitch_extractor.RMVPEOnnxPitchExtractor import RMVPEOnnxPitchExtractor
from voice_changer.pitch_extractor.FcpePitchExtractor import FcpePitchExtractor
from voice_changer.pitch_extractor.FcpeOnnxPitchExtractor import FcpeOnnxPitchExtractor

# Global configuration variables
TRIALS = 30
AUDIO_CHUNK_SIZE_16K = 8192 # Represents ~512ms of audio at 16000Hz (comparable to 192 serverReadChunkSize at 48kHz)

def measure_performance(name, extractor, audio_in_16k, trials=TRIALS):
    # Warmup
    for _ in range(3):
        try:
            extractor.extract(audio_in_16k, 16000, 128)
        except Exception:
            pass
            
    t_start_wall = time.perf_counter()
    t_start_cpu = time.process_time()
    
    success_count = 0
    for _ in range(trials):
        try:
            extractor.extract(audio_in_16k, 16000, 128)
            success_count += 1
        except Exception as e:
            # Let it print once if it errors out
            if success_count == 0:
                print(f"[{name}] Error during run: {e}")
            pass
            
    t_end_wall = time.perf_counter()
    t_end_cpu = time.process_time()
    
    if success_count == 0:
        print(f"| {name:<35} |    FAILED  |      --  |")
        return None
        
    wall_duration = t_end_wall - t_start_wall
    cpu_duration = t_end_cpu - t_start_cpu
    
    avg_latency = (wall_duration / success_count) * 1000 # ms
    cpu_percent = (cpu_duration / wall_duration) * 100 if wall_duration > 0 else 0
    
    print(f"| {name:<35} | {avg_latency:>8.2f} ms | {cpu_percent:>7.1f}% |")
    return {"latency": avg_latency, "cpu": cpu_percent}

@torch.no_grad()
def run_benchmark():
    print("=========================================================")
    print("   Pitch Extractor Comprehensive Benchmark on M4 Mac     ")
    print("=========================================================")
    print(f"Testing with audio chunk size: {AUDIO_CHUNK_SIZE_16K} samples (~512ms)")
    print(f"Number of benchmark trials: {TRIALS}")
    print("---------------------------------------------------------")
    print(f"| {'Extractor & Execution Mode':<35} | {'Latency':<11} | {'CPU Use':<8} |")
    print("---------------------------------------------------------")
    
    # Generate mock 16kHz audio data on CPU
    audio_cpu = torch.randn(AUDIO_CHUNK_SIZE_16K, dtype=torch.float32)
    
    # Models paths
    rmvpe_pt_path = "pretrain/pitch_extractor/rmvpe.pt"
    rmvpe_onnx_path = "pretrain/pitch_extractor/rmvpe.onnx"
    fcpe_pt_path = "pretrain/pitch_extractor/fcpe.pt"
    fcpe_onnx_path = "pretrain/pitch_extractor/fcpe.onnx"
    
    results = {}
    
    # ==========================================
    # 1. Test RMVPE
    # ==========================================
    
    # Mode A: RMVPE (PyTorch - MPS)
    try:
        # Patch DeviceManager to force MPS (disable FP16 to be safe or keep enabled if device manager supports it)
        dev_mgr = DeviceManager.get_instance()
        dev_mgr.initialize(-1, force_fp32=True, disable_jit=True) # disable_jit=True for RMVPE stability
        
        # Audio needs to be on GPU (MPS)
        audio_mps = audio_cpu.to(dev_mgr.device)
        extractor = RMVPEPitchExtractor(rmvpe_pt_path)
        results["RMVPE (PyTorch + MPS)"] = measure_performance("RMVPE (PyTorch + MPS)", extractor, audio_mps)
    except Exception as e:
        print(f"RMVPE MPS Setup Error: {e}")
        
    # Mode B: RMVPE (PyTorch - CPU)
    try:
        dev_mgr = DeviceManager.get_instance()
        # Mock CPU device metadata
        dev_mgr.device = torch.device('cpu')
        dev_mgr.device_metadata = {"id": -1, "name": "CPU", 'backend': 'cpu'}
        dev_mgr.fp16_available = False
        
        extractor = RMVPEPitchExtractor(rmvpe_pt_path)
        results["RMVPE (PyTorch + CPU)"] = measure_performance("RMVPE (PyTorch + CPU)", extractor, audio_cpu)
    except Exception as e:
        print(f"RMVPE CPU Setup Error: {e}")
        
    # Mode C: RMVPE (ONNX - CPU Only)
    try:
        dev_mgr = DeviceManager.get_instance()
        # Mock CPU for ONNX session provider
        dev_mgr.device = torch.device('cpu')
        
        # Monkey patch get_onnx_execution_provider to return CPU only
        original_provider_func = dev_mgr.get_onnx_execution_provider
        dev_mgr.get_onnx_execution_provider = lambda: (["CPUExecutionProvider"], [{"intra_op_num_threads": 8}])
        
        extractor = RMVPEOnnxPitchExtractor(rmvpe_onnx_path)
        results["RMVPE (ONNX + CPU)"] = measure_performance("RMVPE (ONNX + CPU)", extractor, audio_cpu)
        
        # Restore provider func
        dev_mgr.get_onnx_execution_provider = original_provider_func
    except Exception as e:
        print(f"RMVPE ONNX CPU Setup Error: {e}")
        
    # Mode D: RMVPE (ONNX - CoreML / GPU / ANE)
    try:
        dev_mgr = DeviceManager.get_instance()
        dev_mgr.device = torch.device('cpu') # ONNX wrapper handles transfer
        
        # Monkey patch to enforce CoreML
        original_provider_func = dev_mgr.get_onnx_execution_provider
        dev_mgr.get_onnx_execution_provider = lambda: (["CoreMLExecutionProvider", "CPUExecutionProvider"], [{"coreml_flags": 4}, {}])
        
        extractor = RMVPEOnnxPitchExtractor(rmvpe_onnx_path)
        results["RMVPE (ONNX + CoreML)"] = measure_performance("RMVPE (ONNX + CoreML)", extractor, audio_cpu)
        
        # Restore provider func
        dev_mgr.get_onnx_execution_provider = original_provider_func
    except Exception as e:
        print(f"RMVPE ONNX CoreML Setup Error: {e}")

    # ==========================================
    # 2. Test FCPE
    # ==========================================
    print("---------------------------------------------------------")
    
    # Mode A: FCPE (PyTorch - MPS)
    try:
        dev_mgr = DeviceManager.get_instance()
        dev_mgr.initialize(-1, force_fp32=True, disable_jit=True)
        
        audio_mps = audio_cpu.to(dev_mgr.device)
        extractor = FcpePitchExtractor(fcpe_pt_path)
        results["FCPE (PyTorch + MPS)"] = measure_performance("FCPE (PyTorch + MPS)", extractor, audio_mps)
    except Exception as e:
        print(f"FCPE MPS Setup Error: {e}")
        
    # Mode B: FCPE (PyTorch - CPU)
    try:
        dev_mgr = DeviceManager.get_instance()
        dev_mgr.device = torch.device('cpu')
        dev_mgr.device_metadata = {"id": -1, "name": "CPU", 'backend': 'cpu'}
        dev_mgr.fp16_available = False
        
        extractor = FcpePitchExtractor(fcpe_pt_path)
        results["FCPE (PyTorch + CPU)"] = measure_performance("FCPE (PyTorch + CPU)", extractor, audio_cpu)
    except Exception as e:
        print(f"FCPE CPU Setup Error: {e}")
        
    # Mode C: FCPE (ONNX - CPU Only)
    try:
        dev_mgr = DeviceManager.get_instance()
        dev_mgr.device = torch.device('cpu')
        
        original_provider_func = dev_mgr.get_onnx_execution_provider
        dev_mgr.get_onnx_execution_provider = lambda: (["CPUExecutionProvider"], [{"intra_op_num_threads": 8}])
        
        extractor = FcpeOnnxPitchExtractor(fcpe_onnx_path)
        results["FCPE (ONNX + CPU)"] = measure_performance("FCPE (ONNX + CPU)", extractor, audio_cpu)
        
        dev_mgr.get_onnx_execution_provider = original_provider_func
    except Exception as e:
        print(f"FCPE ONNX CPU Setup Error: {e}")
        
    # Mode D: FCPE (ONNX - CoreML / GPU / ANE)
    try:
        dev_mgr = DeviceManager.get_instance()
        dev_mgr.device = torch.device('cpu')
        
        original_provider_func = dev_mgr.get_onnx_execution_provider
        dev_mgr.get_onnx_execution_provider = lambda: (["CoreMLExecutionProvider", "CPUExecutionProvider"], [{"coreml_flags": 4}, {}])
        
        extractor = FcpeOnnxPitchExtractor(fcpe_onnx_path)
        results["FCPE (ONNX + CoreML)"] = measure_performance("FCPE (ONNX + CoreML)", extractor, audio_cpu)
        
        dev_mgr.get_onnx_execution_provider = original_provider_func
    except Exception as e:
        print(f"FCPE ONNX CoreML Setup Error: {e}")
        
    print("=========================================================")
    print("Benchmark complete.")

if __name__ == "__main__":
    run_benchmark()
